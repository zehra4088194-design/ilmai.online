import type { NextRequest } from 'next/server';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { profile, isAdmin } = await requireUserApi();
  const { id } = await params;
  const db = adminClient();
  const { data: quiz } = await db.from('quizzes').select('id,user_id,topic,config,questions,created_at').eq('id', id).maybeSingle();
  if (!quiz || (quiz.user_id !== profile.id && !isAdmin)) throw new HttpError(404, 'Quiz not found');
  const { data: last } = await db.from('quiz_attempts').select('answers,score,total,created_at')
    .eq('quiz_id', id).eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { user_id: _u, ...safe } = quiz;
  void _u;
  return json({ quiz: safe, lastAttempt: last ?? null });
});
