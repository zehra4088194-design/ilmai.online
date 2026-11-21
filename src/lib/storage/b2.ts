import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';

let _client: S3Client | null = null;

/** Backblaze B2 through its S3-compatible API. */
function client() {
  if (!env.b2.endpoint || !env.b2.keyId || !env.b2.appKey || !env.b2.bucket)
    throw new HttpError(503, 'Backblaze B2 storage is not configured (B2_* env vars)', 'storage_not_configured');
  return (_client ??= new S3Client({
    endpoint: env.b2.endpoint,
    region: env.b2.region || 'us-west-004',
    forcePathStyle: true,
    credentials: { accessKeyId: env.b2.keyId, secretAccessKey: env.b2.appKey },
    // B2 rejects the newer default CRC32 checksums – only send them when required
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));
}

export const storageConfigured = () => !!(env.b2.endpoint && env.b2.keyId && env.b2.appKey && env.b2.bucket);

export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: env.b2.bucket, Key: key, Body: body, ContentType: contentType }));
}

export const deleteObject = (key: string) =>
  client().send(new DeleteObjectCommand({ Bucket: env.b2.bucket, Key: key }));

/** Time-limited URL to READ a private object. */
export const signedDownloadUrl = (key: string, expiresIn = 3600) =>
  getSignedUrl(client(), new GetObjectCommand({ Bucket: env.b2.bucket, Key: key }), { expiresIn });

/** Browser credentials can only ever write quarantine keys, never a published object. */
export const signedUploadUrl = (key: string, contentType: string, expiresIn = 300) => {
  if (!key.startsWith('staging/')) throw new Error('Browser uploads must be quarantined');
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: env.b2.bucket, Key: key, ContentType: contentType }), { expiresIn });
};

export const headObject = (key: string) =>
  client().send(new HeadObjectCommand({ Bucket: env.b2.bucket, Key: key }));

/** Bounded, version/ETag-pinned read. Never fetch a caller-supplied URL or buffer an unbounded SDK body. */
export async function readObject(key: string, expectedSize: number, mime: string, maxBytes: number) {
  const head = await headObject(key);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > maxBytes || head.ContentLength !== expectedSize)
    throw new HttpError(400, 'Uploaded file size does not match its declaration');
  if (head.ContentType?.split(';')[0].trim().toLowerCase() !== mime || head.ContentEncoding)
    throw new HttpError(400, 'Uploaded file MIME type does not match its declaration');
  if (!head.ETag) throw new HttpError(400, 'Storage did not return an object version');
  const result = await client().send(new GetObjectCommand({
    Bucket: env.b2.bucket, Key: key, IfMatch: head.ETag, VersionId: head.VersionId,
    Range: `bytes=0-${expectedSize}`, // at most the declared size plus one sentinel byte
  }));
  if (!result.Body) throw new HttpError(400, 'Uploaded file is empty');
  const reader = result.Body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (result.ETag !== head.ETag || result.ContentLength !== expectedSize ||
        result.ContentType?.split(';')[0].trim().toLowerCase() !== mime || result.ContentEncoding)
      throw new HttpError(400, 'Uploaded file changed during validation');
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expectedSize || size > maxBytes) throw new HttpError(413, 'Uploaded file is too large');
      chunks.push(value);
    }
    if (size !== expectedSize) throw new HttpError(400, 'Uploaded file is incomplete');
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
