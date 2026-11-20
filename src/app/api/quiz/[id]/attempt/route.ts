import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import type { QuizQuestion } from '@/lib/quiz';

export const dynamic = 'force-dynamic';

const Body = z.object({ answers: z.array(z.number().int().min(-1).max(10)).max(60), durationS: z.number().int().min(0).max(86400).optional() });

/** Score is computed on the server from the stored answer key. */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { profile } = await requireUserApi();
  const { id } = await params;
  const b = Body.parse(await req.json());
  const db = adminClient();
  const { data: quiz } = await db.from('quizzes').select('id,questions').eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (!quiz) throw new HttpError(404, 'Quiz not found');
  const qs = quiz.questions as QuizQuestion[];
  if (b.answers.length !== qs.length) throw new HttpError(400, 'Answer count does not match the quiz');
  const score = qs.reduce((n, q, i) => n + (b.answers[i] === q.answer ? 1 : 0), 0);
  const { error } = await db.from('quiz_attempts').insert({ quiz_id: id, user_id: profile.id, answers: b.answers, score, total: qs.length, duration_s: b.durationS ?? null });
  if (error) throw error;
  return json({ score, total: qs.length });
});
