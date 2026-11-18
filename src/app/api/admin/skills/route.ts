import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Skill = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, numbers and dashes'),
  name: z.string().min(2).max(100),
  description: z.string().max(400).default(''),
  subject: z.string().max(60).nullable().optional(),
  instructions: z.string().max(40000).default(''),
  schema_json: z.record(z.unknown()).default({}),
  template_html: z.string().max(400000).default(''),
  is_active: z.boolean().default(true),
});

export const POST = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const body = Skill.parse(await req.json());
  const { data, error } = await adminClient().from('skills').insert(body).select('id').single();
  if (error) throw error;
  return json({ id: data.id });
});

export const PATCH = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { id, patch } = z.object({ id: z.string().uuid(), patch: Skill.partial() }).parse(await req.json());
  const { error } = await adminClient().from('skills').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  return json({ ok: true });
});

export const DELETE = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
  const { error } = await adminClient().from('skills').delete().eq('id', id);
  if (error) throw error;
  return json({ ok: true });
});
