import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { signedDownloadUrl } from '@/lib/storage/b2';
import { finalizeUpload, loadOwnedMedia } from '@/lib/media';
import { sanitizeFilename, uploadLimits } from '@/lib/attachment-validation';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().uuid() });
const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

/** Fresh short-lived URL; missing/non-owned/pending files all return the same 404. */
export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const a = await loadOwnedMedia(id, profile.id);
  if (a.status !== 'ready' || /^(staging|uploads)\//.test(a.storage_key)) throw new HttpError(404, 'File not found');
  return json({ id: a.id, kind: a.kind, mime: a.mime, name: sanitizeFilename(a.meta?.name ?? 'attachment'), url: await signedDownloadUrl(a.storage_key, 300), expiresIn: 300 }, noStore);
});

/** Ignore no client metadata: only the stored declaration and actual B2 bytes can finalize an upload. */
export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('file_upload', profile.plan, isAdmin);
  const { id } = Params.parse(await params);
  const body = await req.text();
  z.object({}).strict().parse(body ? JSON.parse(body) : {});
  const limits = uploadLimits((await getSettings()).max_upload_mb);
  const attachment = await finalizeUpload(id, profile.id, limits.maxBytes);
  return json({ ok: true, attachment }, noStore);
});
