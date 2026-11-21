import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { utilityChat } from '@/lib/utility-ai';
import { parseQuiz, quizPrompt, type QuizConfig } from '@/lib/quiz';
import { adminClient } from '@/lib/supabase/admin';
import { logUsage } from '@/lib/usage';
import { truncate } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({
  topic: z.string().min(3).max(500),
  count: z.number().int().min(3).max(50).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  kind: z.enum(['mcq', 'tf', 'mixed']).default('mcq'),
  language: z.string().max(30).default('English'),
  context: z.string().max(8000).optional(),     // "quiz me on this answer"
  conversationId: z.string().uuid().optional(), // add the quiz to this chat…
  mode: z.string().max(60).nullable().optional(), // …or start a new chat in this mode
});

/**
 * Generates a quiz with FREE models, stores it, and drops it into the chat as a special message
 * (messages.meta = {kind:'quiz', quiz_id}). Costs the user no credits; protected by a daily cap.
 */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('quiz', profile.plan, isAdmin);
  const b = Body.parse(await req.json());
  const settings = await getSettings();
  const db = adminClient();

  if (!isAdmin) {
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await db.from('quizzes').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).gte('created_at', since);
    if ((count ?? 0) >= settings.quizzes_per_day) throw new HttpError(429, 'Daily quiz limit reached. Come back tomorrow!', 'quiz_limit');
  }

  const count = Math.min(b.count, settings.quiz_max_questions);
  const config: QuizConfig = { count, difficulty: b.difficulty, kind: b.kind, language: b.language };
  const started = Date.now();

  let questions = parseQuiz('', 0);
  let used = '';
  let cost = 0;
  for (let attempt = 0; attempt < 2 && questions.length < Math.max(3, Math.ceil(count * 0.6)); attempt++) {
    try {
      const r = await utilityChat(quizPrompt({ topic: b.topic, config, audience: 'general user', context: b.context }),
        { userId: profile.id, maxTokens: Math.min(6000, 450 * count + 400), temperature: 0.5, timeoutMs: 75_000, tries: 3, startAt: attempt });
      const parsed = parseQuiz(r.text, count);
      if (parsed.length > questions.length) { questions = parsed; used = r.model; cost = r.cost; }
    } catch (e) {
      if (attempt === 1) {
        await logUsage({ userId: profile.id, kind: 'quiz', status: 'error', error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started });
        throw e;
      }
    }
  }
  if (questions.length < 3) {
    await logUsage({ userId: profile.id, kind: 'quiz', model: used || null, status: 'error', error: 'invalid quiz JSON', latencyMs: Date.now() - started });
    throw new HttpError(502, 'Could not build a good quiz this time. Please try again.', 'quiz_failed');
  }

  /* conversation: reuse or create */
  let conversationId = b.conversationId ?? null;
  if (conversationId) {
    const { data: c } = await db.from('conversations').select('id').eq('id', conversationId).eq('user_id', profile.id).maybeSingle();
    if (!c) throw new HttpError(404, 'Conversation not found');
  } else {
    const { data: c, error } = await db.from('conversations')
      .insert({ user_id: profile.id, title: truncate(`Quiz: ${b.topic}`, 60), mode: null }).select('id').single();
    if (error) throw error;
    conversationId = c.id as string;
  }

  const { data: quiz, error } = await db.from('quizzes')
    .insert({ user_id: profile.id, conversation_id: conversationId, topic: b.topic, config, questions, model: used }).select('id,created_at').single();
  if (error) throw error;
  const { data: msg } = await db.from('messages').insert({
    conversation_id: conversationId, user_id: profile.id, role: 'assistant', model: used,
    content: `📝 Quiz: ${b.topic} · ${questions.length} questions`, meta: { kind: 'quiz', quiz_id: quiz.id },
  }).select('id').single();
  await db.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  await logUsage({ userId: profile.id, kind: 'quiz', model: used, costUsd: cost, latencyMs: Date.now() - started });

  return json({ conversationId, messageId: msg?.id, quizId: quiz.id, content: `📝 Quiz: ${b.topic} · ${questions.length} questions` });
});
