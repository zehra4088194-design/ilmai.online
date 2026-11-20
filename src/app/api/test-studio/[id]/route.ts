import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { AttachmentIds, validateAttachments } from '@/lib/attachments';
import {
  SaveTestInput, TestId, TestQuestion, TestAnswer, QuestionSchema, AnswerSchema,
  sanitizeStudentPaper, reviseQuestions, questionChanged, validateQuestions, StudioPolicySchema,
} from '@/lib/test-studio';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: TestId });

function mapQuestion(row: Record<string, unknown>): TestQuestion {
  return QuestionSchema.parse({
    id: row.id, revision: row.revision, type: row.type, question: row.question,
    options: row.options, marks: row.marks, sourceReference: row.source_reference,
  });
}

function mapAnswer(row: Record<string, unknown>): TestAnswer {
  return AnswerSchema.parse({
    questionId: row.question_id, revision: row.revision, correctOption: row.correct_option,
    modelAnswer: row.model_answer, explanation: row.explanation,
    markingScheme: row.marking_scheme, sourceConfidence: row.source_confidence,
  });
}

export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const db = adminClient();
  const { data: paper, error } = await db.from('test_papers').select('*')
    .eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (error) throw error;
  if (!paper) throw new HttpError(404, 'Test not found');
  const { data: rows, error: questionError } = await db.from('test_questions').select('*')
    .eq('test_id', id).eq('user_id', profile.id).order('position');
  if (questionError) throw questionError;
  const questions = (rows ?? []).map((row) => mapQuestion(row));
  validateQuestions(questions);
  const student = sanitizeStudentPaper({ id, version: paper.version, config: paper.config, questions });
  return json({
    paper: {
      ...student, title: paper.title, status: paper.status, warnings: paper.warnings,
      createdAt: paper.created_at, updatedAt: paper.updated_at,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('teacher_tests', profile.plan, isAdmin);
  const policy = StudioPolicySchema.parse(feature.config ?? {});
  const { id } = Params.parse(await params);
  const body = SaveTestInput.parse(await req.json());
  const sourceIds = AttachmentIds.parse(body.config.sourceIds);
  if (sourceIds.length > policy.max_sources) throw new HttpError(400, 'Too many source files for the current Test Studio settings');
  if (sourceIds.length) {
    await requireFeature('file_upload', profile.plan, isAdmin);
    await validateAttachments(sourceIds, profile.id);
  }

  const db = adminClient();
  const { data: paper, error } = await db.from('test_papers').select('id,version,title')
    .eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (error) throw error;
  if (!paper) throw new HttpError(404, 'Test not found');
  if (paper.version !== body.expectedVersion) throw new HttpError(409, 'This test was changed in another session. Reload it before saving.');

  const [{ data: oldRows, error: oldError }, { data: answerRows, error: answerError }] = await Promise.all([
    db.from('test_questions').select('*').eq('test_id', id).eq('user_id', profile.id).order('position'),
    db.from('test_answer_keys').select('*').eq('test_id', id).eq('user_id', profile.id),
  ]);
  if (oldError) throw oldError;
  if (answerError) throw answerError;

  const previous = (oldRows ?? []).map((row) => mapQuestion(row));
  const revised = reviseQuestions(previous, body.questions, body.replacements);
  if (revised.length > policy.max_questions) throw new HttpError(400, 'This test exceeds the administrator question limit');
  const summary = validateQuestions(revised);
  const config = {
    ...body.config,
    mcq: summary.counts.mcq, short: summary.counts.short, long: summary.counts.long,
    title: body.config.title || paper.title,
  };
  const oldQuestions = new Map(previous.map((q) => [q.id, q]));
  const oldAnswers = new Map((answerRows ?? []).map((row) => {
    const answer = mapAnswer(row);
    return [answer.questionId, answer] as const;
  }));
  const replacements = new Map(body.replacements.map((answer) => [answer.questionId, answer]));
  const nextAnswers: TestAnswer[] = [];

  for (const question of revised) {
    const replacement = replacements.get(question.id);
    if (replacement) {
      nextAnswers.push({ ...replacement, questionId: question.id, revision: question.revision });
      continue;
    }
    const before = oldQuestions.get(question.id);
    const existing = oldAnswers.get(question.id);
    if (before && existing && !questionChanged(before, question))
      nextAnswers.push({ ...existing, revision: question.revision });
  }

  const { data: saved, error: saveError } = await db.rpc('save_test_studio_paper', {
    p_user: profile.id,
    p_test: id,
    p_expected_version: body.expectedVersion,
    p_title: config.title,
    p_config: config,
    p_questions: revised.map((question, position) => ({ ...question, position })),
    p_answers: nextAnswers,
    p_warnings: [],
  });
  if (saveError) {
    if (saveError.message.includes('test_version_conflict'))
      throw new HttpError(409, 'This test was changed in another session. Reload it before saving.');
    throw saveError;
  }
  const invalidatedAnswers = revised.filter((question) => {
    const before = oldQuestions.get(question.id);
    return !!before && questionChanged(before, question) && !replacements.has(question.id);
  }).map((question) => question.id);
  return json({ saved, invalidatedAnswers });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const db = adminClient();
  const { data, error: findError } = await db.from('test_papers').select('id')
    .eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (findError) throw findError;
  if (!data) throw new HttpError(404, 'Test not found');
  const { error } = await db.from('test_papers').delete().eq('id', id).eq('user_id', profile.id);
  if (error) throw error;
  return json({ ok: true });
});
