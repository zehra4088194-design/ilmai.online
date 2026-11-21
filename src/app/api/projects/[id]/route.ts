import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { signedDownloadUrl } from '@/lib/storage/b2';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().uuid() });
const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(['active','archived']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');

export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const db = adminClient();
  const { data: project, error } = await db.from('projects')
    .select('id,name,description,status,created_at,updated_at')
    .eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (error) throw error;
  if (!project) throw new HttpError(404, 'Project not found');
  const { data: links, error: linkError } = await db.from('project_assets')
    .select('media_asset_id,label,added_at').eq('project_id', id).eq('user_id', profile.id)
    .order('added_at', { ascending: false }).limit(200);
  if (linkError) throw linkError;
  const ids = (links ?? []).map((link) => link.media_asset_id);
  const { data: assets, error: assetError } = ids.length
    ? await db.from('media_assets').select('id,kind,mime,size_bytes,prompt,model,meta,storage_key,created_at')
      .in('id', ids).eq('user_id', profile.id).eq('status', 'ready')
    : { data: [], error: null };
  if (assetError) throw assetError;
  const byId = new Map((assets ?? []).map((asset) => [asset.id, asset]));
  const projectAssets = await Promise.all((links ?? []).flatMap((link) => {
    const asset = byId.get(link.media_asset_id);
    if (!asset) return [];
    return [{
      id: asset.id, kind: asset.kind, mime: asset.mime, sizeBytes: asset.size_bytes,
      name: typeof asset.meta?.name === 'string' ? asset.meta.name : asset.prompt || asset.kind,
      prompt: asset.prompt, model: asset.model, addedAt: link.added_at,
      createdAt: asset.created_at, downloadUrl: signedDownloadUrl(asset.storage_key, 300),
    }];
  }).map(async (item) => ({ ...item, downloadUrl: await item.downloadUrl })));
  return json({ project, assets: projectAssets }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const body = Patch.parse(await req.json());
  const { data, error } = await adminClient().from('projects')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', profile.id)
    .select('id,name,description,status,created_at,updated_at').maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Project not found');
  return json({ project: data });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const db = adminClient();
  const { data: project, error: findError } = await db.from('projects')
    .select('id').eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (findError) throw findError;
  if (!project) throw new HttpError(404, 'Project not found');
  const { error } = await db.from('projects').delete().eq('id', id).eq('user_id', profile.id);
  if (error) throw error;
  return json({ ok: true });
});
