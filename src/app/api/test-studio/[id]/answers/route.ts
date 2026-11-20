import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { TestId, AnswerSchema } from '@/lib/test-studio';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { profile } = await requireUserApi();
  const { id } = z.object({ id: TestId }).parse(await params);
  const db = adminClient();
  const { data: paper, error: paperError } = await db.from('test_papers').select('id')
    .eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (paperError) throw paperError;
  if (!paper) throw new HttpError(404, 'Test not found');

  const [{ data: questions, error: questionError }, { data: rows, error }] = await Promise.all([
    db.from('test_questions').select('id,revision').eq('test_id', id).eq('user_id', profile.id),
    db.from('test_answer_keys').select('question_id,revision,correct_option,model_answer,explanation,marking_scheme,source_confidence')
      .eq('test_id', id).eq('user_id', profile.id),
  ]);
  if (questionError) throw questionError;
  if (error) throw error;

  const revisions = new Map((questions ?? []).map((question) => [question.id, question.revision]));
  const answers = (rows ?? []).map((row) => AnswerSchema.parse({
    questionId: row.question_id, revision: row.revision, correctOption: row.correct_option,
    modelAnswer: row.model_answer, explanation: row.explanation,
    markingScheme: row.marking_scheme, sourceConfidence: row.source_confidence,
  }));
  const stale = answers.filter((answer) => revisions.get(answer.questionId) !== answer.revision).map((answer) => answer.questionId);
  const complete = stale.length === 0 && answers.length === (questions ?? []).length;
  return json({ answers, stale, complete }, { headers: { 'Cache-Control': 'private, no-store' } });
});
