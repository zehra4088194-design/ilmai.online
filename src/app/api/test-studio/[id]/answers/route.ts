import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { TestId, AnswerSchema, QuestionSchema, TestConfigSchema, validateAnswers, type TestQuestion } from '@/lib/test-studio';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { profile } = await requireUserApi();
  const { id } = z.object({ id: TestId }).parse(await params);
  const db = adminClient();
  const { data: paper, error: paperError } = await db.from('test_papers').select('id,config')
    .eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (paperError) throw paperError;
  if (!paper) throw new HttpError(404, 'Test not found');

  const [{ data: questions, error: questionError }, { data: rows, error }] = await Promise.all([
    db.from('test_questions').select('id,revision,type,question,options,marks,source_reference').eq('test_id', id).eq('user_id', profile.id),
    db.from('test_answer_keys').select('question_id,revision,correct_option,model_answer,explanation,marking_scheme,source_confidence')
      .eq('test_id', id).eq('user_id', profile.id),
  ]);
  if (questionError) throw questionError;
  if (error) throw error;

  const mappedQuestions: TestQuestion[] = (questions ?? []).map((question) => QuestionSchema.parse({
    id: question.id, revision: question.revision, type: question.type, question: question.question,
    options: question.options, marks: question.marks, sourceReference: question.source_reference,
  }));
  const revisions = new Map(mappedQuestions.map((question) => [question.id, question.revision]));
  const answers = (rows ?? []).map((row) => AnswerSchema.parse({
    questionId: row.question_id, revision: row.revision, correctOption: row.correct_option,
    modelAnswer: row.model_answer, explanation: row.explanation,
    markingScheme: row.marking_scheme, sourceConfidence: row.source_confidence,
  }));
  const stale = answers.filter((answer) => revisions.get(answer.questionId) !== answer.revision).map((answer) => answer.questionId);
  let valid = false;
  let validationError: string | null = null;
  try {
    validateAnswers(mappedQuestions, answers, TestConfigSchema.parse(paper.config));
    valid = true;
  } catch (e) {
    validationError = e instanceof Error ? e.message : 'Answer key needs review';
  }
  const missing = mappedQuestions.filter((question) => !answers.some((answer) => answer.questionId === question.id)).map((question) => question.id);
  const complete = valid && stale.length === 0 && missing.length === 0 && mappedQuestions.length > 0;
  return json({ answers, stale, missing, complete, validationError }, { headers: { 'Cache-Control': 'private, no-store' } });
});
