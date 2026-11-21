import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Mode = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, numbers and dashes'),
  audience: z.enum(['student', 'teacher', 'both']),
  name: z.string().min(2).max(60),
  name_ur: z.string().max(60).nullable().optional(),
  icon: z.string().max(30).default('sparkles'),
  description: z.string().max(200).default(''),
  system_prompt: z.string().max(6000).default(''),
  starters: z.array(z.string().max(200)).max(8).default([]),
  tool: z.enum(['quiz']).nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(100),
});

export const POST = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const body = Mode.parse(await req.json());
  const { data, error } = await adminClient().from('modes').insert(body).select('id').single();
  if (error) throw error;
  revalidateTag('modes');
  return json({ id: data.id });
});

export const PATCH = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { id, patch } = z.object({ id: z.string().uuid(), patch: Mode.partial() }).parse(await req.json());
  const { error } = await adminClient().from('modes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  revalidateTag('modes');
  return json({ ok: true });
});

export const DELETE = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
  const { error } = await adminClient().from('modes').delete().eq('id', id);
  if (error) throw error;
  revalidateTag('modes');
  return json({ ok: true });
});
