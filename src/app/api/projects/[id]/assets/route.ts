import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().uuid() });
const AddBody = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(50),
}).strict().refine((value) => new Set(value.assetIds).size === value.assetIds.length, 'Duplicate assets');
const RemoveBody = z.object({ assetId: z.string().uuid() }).strict();

async function requireOwnedProject(id: string, userId: string) {
  const { data, error } = await adminClient().from('projects').select('id')
    .eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Project not found');
}

export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const { assetIds } = AddBody.parse(await req.json());
  await requireOwnedProject(id, profile.id);
  const db = adminClient();
  const { data: owned, error } = await db.from('media_assets').select('id')
    .in('id', assetIds).eq('user_id', profile.id).eq('status', 'ready');
  if (error) throw error;
  if ((owned ?? []).length !== assetIds.length)
    throw new HttpError(404, 'One or more files are unavailable');
  const { error: insertError } = await db.from('project_assets').upsert(
    assetIds.map((media_asset_id) => ({ project_id: id, user_id: profile.id, media_asset_id })),
    { onConflict: 'project_id,media_asset_id', ignoreDuplicates: true },
  );
  if (insertError) throw insertError;
  await db.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', profile.id);
  return json({ ok: true, linked: assetIds.length });
});

export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const { assetId } = RemoveBody.parse(await req.json());
  await requireOwnedProject(id, profile.id);
  const { error } = await adminClient().from('project_assets').delete()
    .eq('project_id', id).eq('user_id', profile.id).eq('media_asset_id', assetId);
  if (error) throw error;
  await adminClient().from('projects').update({ updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', profile.id);
  return json({ ok: true });
});
