import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const CreateProject = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
}).strict();

export const GET = handle(async () => {
  const { profile } = await requireUserApi();
  const db = adminClient();
  const [{ data: projects, error }, { data: links, error: linkError }] = await Promise.all([
    db.from('projects').select('id,name,description,status,created_at,updated_at')
      .eq('user_id', profile.id).order('updated_at', { ascending: false }).limit(100),
    db.from('project_assets').select('project_id').eq('user_id', profile.id),
  ]);
  if (error) throw error;
  if (linkError) throw linkError;
  const counts = new Map<string, number>();
  for (const link of links ?? []) counts.set(link.project_id, (counts.get(link.project_id) ?? 0) + 1);
  return json({
    projects: (projects ?? []).map((project) => ({ ...project, assetCount: counts.get(project.id) ?? 0 })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const POST = handle(async (req: NextRequest) => {
  const { profile } = await requireUserApi();
  const body = CreateProject.parse(await req.json());
  const { data, error } = await adminClient().from('projects')
    .insert({ user_id: profile.id, name: body.name, description: body.description })
    .select('id,name,description,status,created_at,updated_at').single();
  if (error) throw error;
  return json({ project: { ...data, assetCount: 0 } }, { status: 201 });
});
