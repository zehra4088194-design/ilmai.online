import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

/** Time-limited URL for the BROWSER to upload directly (needs CORS rule on the bucket – see docs). */
export const signedUploadUrl = (key: string, contentType: string, expiresIn = 600) =>
  getSignedUrl(client(), new PutObjectCommand({ Bucket: env.b2.bucket, Key: key, ContentType: contentType }), { expiresIn });
