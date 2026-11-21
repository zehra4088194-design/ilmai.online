import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { signedDownloadUrl } from '@/lib/storage/b2';

export const dynamic = 'force-dynamic';
const Kind = z.enum(['all','image','video','audio','pdf','pptx','docx','file']).default('all');

export const GET = handle(async (req: NextRequest) => {
  const { profile } = await requireUserApi();
  const url = new URL(req.url);
  const kind = Kind.parse(url.searchParams.get('kind') ?? 'all');
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120).toLocaleLowerCase();
  const projectId = url.searchParams.get('projectId');
  const db = adminClient();
  let assetIds: string[] | null = null;
  if (projectId) {
    const valid = z.string().uuid().safeParse(projectId);
    if (!valid.success) throw new HttpError(400, 'Invalid project');
    const { data: project, error: projectError } = await db.from('projects').select('id')
      .eq('id', projectId).eq('user_id', profile.id).maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new HttpError(404, 'Project not found');
    const { data: links, error } = await db.from('project_assets').select('media_asset_id')
      .eq('project_id', projectId).eq('user_id', profile.id);
    if (error) throw error;
    assetIds = (links ?? []).map((item) => item.media_asset_id);
    if (!assetIds.length) return json({ assets: [], projectId }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  let request = db.from('media_assets')
    .select('id,kind,mime,size_bytes,prompt,model,meta,status,storage_key,created_at')
    .eq('user_id', profile.id).eq('status', 'ready')
    .order('created_at', { ascending: false }).limit(250);
  if (kind !== 'all') request = request.eq('kind', kind);
  if (assetIds) request = request.in('id', assetIds);
  const { data, error } = await request;
  if (error) throw error;
  const assets = (data ?? []).filter((asset) => {
    const name = typeof asset.meta?.name === 'string' ? asset.meta.name : '';
    return !query || [name, asset.prompt ?? '', asset.model ?? '', asset.kind].some((value) => value.toLocaleLowerCase().includes(query));
  });
  return json({
    projectId,
    assets: await Promise.all(assets.map(async (asset) => ({
      id: asset.id, kind: asset.kind, mime: asset.mime, sizeBytes: asset.size_bytes,
      name: typeof asset.meta?.name === 'string' ? asset.meta.name : asset.prompt || asset.kind,
      prompt: asset.prompt, model: asset.model, createdAt: asset.created_at,
      downloadUrl: await signedDownloadUrl(asset.storage_key, 300),
    }))),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});
