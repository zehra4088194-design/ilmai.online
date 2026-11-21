import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const COLORS = ['#22c55e','#a78bfa','#f472b6','#60a5fa','#f59e0b','#22d3ee','#fb7185','#a3e635'] as const;
const FolderBody = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(COLORS).optional(),
});

export const GET = handle(async () => {
  const { profile } = await requireUserApi();
  const supabase = await createClient();
  const { data, error } = await supabase.from('chat_folders')
    .select('id,name,color,created_at,updated_at')
    .eq('user_id', profile.id).order('created_at', { ascending: true });
  if (error) throw error;
  return json({ folders: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const POST = handle(async (req: NextRequest) => {
  const { profile } = await requireUserApi();
  const body = FolderBody.parse(await req.json());
  const supabase = await createClient();
  const { count, error: countError } = await supabase.from('chat_folders')
    .select('id', { count: 'exact', head: true }).eq('user_id', profile.id);
  if (countError) throw countError;
  if ((count ?? 0) >= 30) throw new HttpError(400, 'You can create up to 30 chat folders');
  const { data, error } = await supabase.from('chat_folders')
    .insert({ user_id: profile.id, name: body.name, color: body.color ?? '#22c55e' })
    .select('id,name,color,created_at,updated_at').single();
  if (error?.code === '23505') throw new HttpError(409, 'A folder with this name already exists');
  if (error) throw error;
  return json({ folder: data }, 201);
});
