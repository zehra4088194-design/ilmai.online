import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { signedUploadUrl } from '@/lib/storage/b2';
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

  const key = `staging/${profile.id}/${randomUUID()}.${type.ext}`;
  const uploadUrl = await signedUploadUrl(key, mime);
  const { data, error } = await adminClient().from('media_assets')
    .insert({ user_id: profile.id, kind: type.kind, storage_key: key, mime, size_bytes: size, status: 'pending', meta: { name: sanitizeFilename(name ?? `attachment.${type.ext}`) } })
    .select('id').single();
  if (error) throw error;
  return json({ assetId: data.id, uploadUrl, expiresIn: 300 }, { headers: { 'Cache-Control': 'private, no-store' } });
});
