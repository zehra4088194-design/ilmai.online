import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { signedUploadUrl, storageConfigured } from '@/lib/storage/b2';
import { adminClient } from '@/lib/supabase/admin';
import { attachmentType, OFFICE_LIMITS, sanitizeFilename, uploadLimits, validateDeclaration } from '@/lib/attachment-validation';

export const dynamic = 'force-dynamic';

/** Shared server-enforced limits for all attachment pickers. */
export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('file_upload', profile.plan, isAdmin);
  return json(uploadLimits((await getSettings()).max_upload_mb), { headers: { 'Cache-Control': 'private, no-store' } });
});

const Body = z.object({ mime: z.string().max(160), size: z.number().int().positive(), name: z.string().max(255).optional() });

/** Browser PUTs only into quarantine, then PATCHes /api/media/:id to verify and publish. */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('file_upload', profile.plan, isAdmin);
  const { mime, size, name } = Body.parse(await req.json());
  const limits = uploadLimits((await getSettings()).max_upload_mb);
  const declaredType = attachmentType(mime);
  const maxUploadBytes = declaredType && ['docx', 'pptx', 'xlsx'].includes(declaredType.ext)
    ? Math.min(limits.maxBytes, OFFICE_LIMITS.fileBytes)
    : limits.maxBytes;
  let type;
  try { type = validateDeclaration(mime, size, maxUploadBytes); }
  catch (e) {
    const overTextLimit = declaredType?.kind === 'file' && declaredType.ext !== 'xlsx' && size > limits.maxTextBytes;
    throw new HttpError(size > maxUploadBytes || overTextLimit ? 413 : 400, e instanceof Error ? e.message : 'Invalid file');
  }

  if (!storageConfigured()) {
    throw new HttpError(
      503,
      'File storage is not configured yet. Add B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_APPLICATION_KEY and B2_BUCKET in Coolify, then redeploy.',
      'storage_not_configured',
    );
  }

  const key = `staging/${profile.id}/${randomUUID()}.${type.ext}`;
  let uploadUrl: string;
  try {
    uploadUrl = await signedUploadUrl(key, mime);
  } catch (error) {
    console.error('[media/upload-url] Could not sign B2 upload URL:', error);
    throw new HttpError(
      503,
      'Could not connect to Backblaze B2. Check the B2 endpoint, region and application key in Coolify.',
      'storage_presign_failed',
    );
  }

  const { data, error } = await adminClient().from('media_assets')
    .insert({ user_id: profile.id, kind: type.kind, storage_key: key, mime, size_bytes: size, status: 'pending', meta: { name: sanitizeFilename(name ?? `attachment.${type.ext}`) } })
    .select('id').single();
  if (error) {
    console.error('[media/upload-url] Could not create media_assets upload record:', {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    });
    throw new HttpError(503, 'Supabase could not create the upload record. Check the media_assets table and service-role configuration.', 'upload_record_failed');
  }
  return json({ assetId: data.id, uploadUrl, expiresIn: 300 }, { headers: { 'Cache-Control': 'private, no-store' } });
});
