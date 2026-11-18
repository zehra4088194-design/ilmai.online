import type { NextRequest } from 'next/server';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { signedDownloadUrl } from '@/lib/storage/b2';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, userId: string, isAdmin: boolean) {
  const { data } = await adminClient().from('media_assets').select('*').eq('id', id).maybeSingle();
  if (!data || (!isAdmin && data.user_id !== userId)) throw new HttpError(404, 'File not found');
  return data;
}

/** Fresh signed URL (1 h) for a private file. */
export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile, isAdmin } = await requireUserApi();
  const a = await load((await params).id, profile.id, isAdmin);
  return json({ id: a.id, kind: a.kind, mime: a.mime, url: await signedDownloadUrl(a.storage_key) });
});

/** Mark an upload as finished. */
export const PATCH = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile, isAdmin } = await requireUserApi();
  const a = await load((await params).id, profile.id, isAdmin);
  await adminClient().from('media_assets').update({ status: 'ready' }).eq('id', a.id);
  return json({ ok: true });
});
