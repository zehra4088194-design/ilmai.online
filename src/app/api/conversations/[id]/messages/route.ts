import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Stores the user's message; the browser then calls /api/chat once per selected model. */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('text_chat', profile.plan, isAdmin);
  const { id } = await params;
  const { content } = z.object({ content: z.string().min(1).max(20000) }).parse(await req.json());
  const supabase = await createClient();
  const { data: conv } = await supabase.from('conversations').select('id').eq('id', id).maybeSingle(); // RLS: must be yours
  if (!conv) throw new HttpError(404, 'Conversation not found');
  const { data, error } = await supabase.from('messages')
    .insert({ conversation_id: id, user_id: profile.id, role: 'user', content }).select('id').single();
  if (error) throw error;
  return json({ id: data.id });
});
