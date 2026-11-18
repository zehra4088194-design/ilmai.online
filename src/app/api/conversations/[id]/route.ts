import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireUserApi();
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages').select('id,role,content,model,created_at').eq('conversation_id', id).order('created_at');
  if (error) throw error;
  return json({ messages: data });
});

const Patch = z.object({ title: z.string().min(1).max(120).optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() });

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireUserApi();
  const { id } = await params;
  const patch = Patch.parse(await req.json());
  const supabase = await createClient();
  const { error } = await supabase.from('conversations').update(patch).eq('id', id);
  if (error) throw error;
  return json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireUserApi();
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) throw error;
  return json({ ok: true });
});
