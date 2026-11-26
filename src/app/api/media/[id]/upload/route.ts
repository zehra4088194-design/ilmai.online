import type { NextRequest } from 'next/server';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { putObject } from '@/lib/storage/b2';
import { loadOwnedMedia } from '@/lib/media';
import { uploadLimits, validateDeclaration } from '@/lib/attachment-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().uuid() });

/** Read a single file with a strict byte ceiling; never buffer an unbounded request. */
async function readBoundedBody(req: Request, expectedBytes: number, maxBytes: number): Promise<Buffer> {
  const declaredLength = req.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) !== expectedBytes) {
    throw new HttpError(400, 'Upload size does not match the file declaration.', 'upload_size_mismatch');
  }
  if (!req.body) throw new HttpError(400, 'The upload body is empty.', 'upload_empty');

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedBytes || total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, 'The uploaded file exceeds its allowed size.', 'upload_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total !== expectedBytes) throw new HttpError(400, 'Upload was incomplete. Please retry.', 'upload_incomplete');
  return Buffer.concat(chunks, total);
}

/**
 * Same-origin upload proxy: browser sends the file to Ilm AI, then the app server
 * writes it to B2. This deliberately avoids browser-to-B2 CORS preflight entirely.
 * The object remains in the user's staging prefix until /api/media/:id PATCH verifies it.
 */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('file_upload', profile.plan, isAdmin);
  const { id } = Params.parse(await params);
  const asset = await loadOwnedMedia(id, profile.id);

  if (asset.status !== 'pending' || !asset.storage_key.startsWith(`staging/${profile.id}/`)) {
    throw new HttpError(404, 'Upload not found.', 'upload_not_found');
  }

  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== asset.mime.toLowerCase()) {
    throw new HttpError(400, 'Uploaded file type does not match its declaration.', 'upload_type_mismatch');
  }

  const limits = uploadLimits((await getSettings()).max_upload_mb);
  try {
    validateDeclaration(asset.mime, asset.size_bytes, limits.maxBytes);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid upload declaration.', 'upload_invalid');
  }

  const bytes = await readBoundedBody(req, asset.size_bytes, limits.maxBytes);
  try {
    await putObject(asset.storage_key, bytes, asset.mime);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown storage error';
    const value = error && typeof error === 'object' ? error as { name?: string; $metadata?: { httpStatusCode?: number; requestId?: string } } : {};
    console.error('[media/upload] B2 PutObject failed:', {
      name: value.name ?? 'Error',
      message: detail,
      status: value.$metadata?.httpStatusCode ?? null,
      requestId: value.$metadata?.requestId ?? null,
      bucketConfigured: true,
    });
    throw new HttpError(502, `Backblaze B2 upload failed: ${detail}`, 'storage_upload_failed');
  }

  return json({ ok: true, uploadedBytes: bytes.length }, { headers: { 'Cache-Control': 'private, no-store' } });
});
