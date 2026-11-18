import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { signedUploadUrl } from '@/lib/storage/b2';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ALLOWED: Record<string, { kind: 'image' | 'pdf'; ext: string }> = {
  'image/png': { kind: 'image', ext: 'png' },
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'application/pdf': { kind: 'pdf', ext: 'pdf' },
};

const Body = z.object({ mime: z.string(), size: z.number().int().positive() });

/** Step 1 of a browser → B2 upload. The browser then PUTs the file to `uploadUrl`, then PATCHes /api/media/:id. */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('file_upload', profile.plan, isAdmin);
  const { mime, size } = Body.parse(await req.json());
  const type = ALLOWED[mime];
  if (!type) throw new HttpError(400, 'Only PNG, JPG, WEBP and PDF files are allowed');
  const settings = await getSettings();
  if (size > settings.max_upload_mb * 1024 * 1024) throw new HttpError(413, `Max file size is ${settings.max_upload_mb} MB`);

  const key = `uploads/${profile.id}/${randomUUID()}.${type.ext}`;
  const { data, error } = await adminClient()
    .from('media_assets')
    .insert({ user_id: profile.id, kind: type.kind, storage_key: key, mime, size_bytes: size, status: 'pending' })
    .select('id').single();
  if (error) throw error;
  return json({ assetId: data.id, uploadUrl: await signedUploadUrl(key, mime), key });
});
