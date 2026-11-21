import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const COLORS = ['#22c55e','#a78bfa','#f472b6','#60a5fa','#f59e0b','#22d3ee','#fb7185','#a3e635'] as const;
const Patch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: z.enum(COLORS).optional(),
}).refine((value) => value.name !== undefined || value.color !== undefined, 'Provide a name or colour');

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = z.object({ id: z.string().uuid() }).parse(await params);
  const patch = Patch.parse(await req.json());
  const supabase = await createClient();
  const { data, error } = await supabase.from('chat_folders').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', profile.id).select('id,name,color,created_at,updated_at').maybeSingle();
  if (error?.code === '23505') throw new HttpError(409, 'A folder with this name already exists');
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Folder not found');
  return json({ folder: data });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = z.object({ id: z.string().uuid() }).parse(await params);
  const supabase = await createClient();
  const { data, error } = await supabase.from('chat_folders').delete()
    .eq('id', id).eq('user_id', profile.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Folder not found');
  // The database foreign key moves its chats back to All chats automatically.
  return json({ ok: true });
});
