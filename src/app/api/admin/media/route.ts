import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { deleteObject, signedDownloadUrl } from '@/lib/storage/b2';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const id = new URL(req.url).searchParams.get('id');
  const { data } = await adminClient().from('media_assets').select('storage_key').eq('id', id ?? '').maybeSingle();
  if (!data) throw new HttpError(404, 'Not found');
  return json({ url: await signedDownloadUrl(data.storage_key) });
});

export const DELETE = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
  const db = adminClient();
  const { data } = await db.from('media_assets').select('storage_key').eq('id', id).maybeSingle();
  if (!data) throw new HttpError(404, 'Not found');
  await deleteObject(data.storage_key).catch((e) => console.error('[b2] delete failed', e));
  await db.from('media_assets').delete().eq('id', id);
  return json({ ok: true });
});
