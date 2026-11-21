import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getAllTextModels, canUseTier } from '@/lib/models';
import { aiRouterChat } from '@/lib/ai-router';
import { adminClient } from '@/lib/supabase/admin';
import { AttachmentIds, attachmentContent, validateAttachments, type Attachment } from '@/lib/attachments';
import {
  RegenerateInput, StudioPolicySchema, TestConfigSchema, QuestionSchema, AnswerSchema,
  parseGeneratedTest, testGenerationPrompt, reviseQuestions, questionChanged, validateAnswers, sanitizeStudentPaper,
  type TestQuestion, type TestAnswer,
} from '@/lib/test-studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('teacher_tests', profile.plan, isAdmin);
  const policy = StudioPolicySchema.parse(feature.config ?? {});
  const { id } = z.object({ id: z.string().uuid() }).parse(await params);
  const body = RegenerateInput.parse(await req.json());
  const db = adminClient();

  const { data: paper, error: paperError } = await db.from('test_papers').select('*')
    .eq('id', id).eq('user_id', profile.id).maybeSingle();
  if (paperError) throw paperError;
  if (!paper) throw new HttpError(404, 'Test not found');
  if (paper.version !== body.expectedVersion)
    throw new HttpError(409, 'This test was changed in another session. Reload it before regenerating.');

  const [{ data: questionRows, error: questionError }, { data: answerRows, error: answerError }] = await Promise.all([
    db.from('test_questions').select('*').eq('test_id', id).eq('user_id', profile.id).order('position'),
    db.from('test_answer_keys').select('*').eq('test_id', id).eq('user_id', profile.id),
  ]);
  if (questionError) throw questionError;
  if (answerError) throw answerError;

  const currentQuestions: TestQuestion[] = (questionRows ?? []).map((row) => QuestionSchema.parse({
    id: row.id, revision: row.revision, type: row.type, question: row.question,
    options: row.options, marks: row.marks, sourceReference: row.source_reference,
  }));
  const config = TestConfigSchema.parse(paper.config);
  const currentAnswers: TestAnswer[] = (answerRows ?? []).map((row) => AnswerSchema.parse({
    questionId: row.question_id, revision: row.revision, correctOption: row.correct_option,
    modelAnswer: row.model_answer, explanation: row.explanation,
    markingScheme: row.marking_scheme, sourceConfidence: row.source_confidence,
  }));
  const selected = body.scope === 'full'
    ? currentQuestions
    : body.scope === 'category'
      ? currentQuestions.filter((question) => question.type === body.category)
      : currentQuestions.filter((question) => question.id === body.questionId);
  if (!selected.length) throw new HttpError(400, 'No matching questions were found to regenerate');

  const targetCounts = {
    mcq: selected.filter((question) => question.type === 'mcq').length,
    short: selected.filter((question) => question.type === 'short').length,
    long: selected.filter((question) => question.type === 'long').length,
  };
  const generationConfig = TestConfigSchema.parse({ ...config, ...targetCounts });
  const sourceIds = AttachmentIds.parse(config.sourceIds);
  if (sourceIds.length > policy.max_sources)
    throw new HttpError(400, 'The saved test has more sources than the current Test Studio limit');

  let sourceFiles: Attachment[] = [];
  if (sourceIds.length) {
    await requireFeature('file_upload', profile.plan, isAdmin);
    sourceFiles = await validateAttachments(sourceIds, profile.id);
    const { data: sizes, error } = await db.from('media_assets').select('id,size_bytes')
      .in('id', sourceIds).eq('user_id', profile.id).eq('status', 'ready');
    if (error) throw error;
    const maxBytes = policy.max_source_mb * 1024 * 1024;
    if ((sizes ?? []).length !== sourceIds.length || sizes!.some((row) => Number(row.size_bytes) > maxBytes))
      throw new HttpError(413, 'A source file exceeds the current Test Studio size limit');
  }

  const needsVision = sourceFiles.some((file) => file.kind === 'image');
  const needsDocuments = sourceFiles.some((file) => file.mime === 'application/pdf');
  const models = await getAllTextModels();
  const permitted = models.filter((candidate) =>
    (isAdmin || candidate.enabled) &&
    (isAdmin || canUseTier(profile.plan, candidate.tier)) &&
    (!needsVision || candidate.vision) &&
    (!needsDocuments || candidate.documents)
  );
  const preferredId = body.model ?? policy.default_model;
  const model = (preferredId ? permitted.find((candidate) => candidate.id === preferredId) : undefined) ??
    (body.model ? undefined : permitted.find((candidate) => candidate.isDefault) ??
      permitted.find((candidate) => candidate.isFree) ?? permitted[0]);
  if (!model) throw new HttpError(400, 'No enabled model on your plan supports these sources', 'model_unavailable');

  const reservationId = randomUUID();
  const charge = isAdmin ? 0 : policy.regeneration_cost;
  const reservation = await db.rpc('reserve_test_generation', {
    p_id: reservationId, p_user: profile.id, p_key: body.requestId, p_amount: charge,
    p_daily_limit: isAdmin ? 0 : policy.daily_limit,
    p_monthly_limit: isAdmin ? 0 : policy.monthly_limit,
  });
  if (reservation.error) {
    if (reservation.error.message.includes('insufficient_credits'))
      throw new HttpError(402, 'Not enough credits to regenerate this test', 'out_of_credits');
    if (reservation.error.message.includes('test_daily_limit'))
      throw new HttpError(429, 'You have reached your daily Test Studio limit', 'daily_test_limit');
    if (reservation.error.message.includes('test_monthly_limit'))
      throw new HttpError(429, 'You have reached your monthly Test Studio limit', 'monthly_test_limit');
    throw reservation.error;
  }
  if ((reservation.data as { duplicate?: boolean })?.duplicate)
    throw new HttpError(409, 'This regeneration request is already being processed or has completed.');

  const started = Date.now();
  let committed = false;
  try {
    const userPrompt = [
      config.topic ? 'Topic: ' + config.topic : '',
      config.prompt ? 'Additional instructions: ' + config.prompt : '',
      config.subject ? 'Subject: ' + config.subject : '',
      config.grade ? 'Class/grade: ' + config.grade : '',
      'Regenerate only the selected portion of this existing examination paper.',
    ].filter(Boolean).join('\n');
    const content = sourceIds.length
      ? await attachmentContent(userPrompt, sourceIds, profile.id, { vision: model.vision, documents: model.documents })
      : userPrompt;
    const result = await aiRouterChat({
      userId: profile.id,
      model: model.id,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: testGenerationPrompt(generationConfig, currentQuestions.map((question) => question.question)) },
        { role: 'user', content },
      ],
    });
    const generated = parseGeneratedTest(result.choices?.[0]?.message?.content ?? '', generationConfig, randomUUID);
    if (generated.questions.length !== selected.length)
      throw new HttpError(502, 'The model returned the wrong number of replacement questions', 'invalid_regeneration');

    const replacementByStableId = new Map<string, TestQuestion>();
    generated.questions.forEach((question, index) => {
      replacementByStableId.set(selected[index].id, {
        ...question, id: selected[index].id, revision: selected[index].revision,
      });
    });

    let candidate: TestQuestion[];
    if (body.scope === 'full') {
      candidate = generated.questions.map((question, index) => ({
        ...question,
        id: selected[index].id,
        revision: selected[index].revision,
      }));
    } else {
      candidate = currentQuestions.map((question) => replacementByStableId.get(question.id) ?? question);
    }

    const revised = reviseQuestions(currentQuestions, candidate, []);
    const generatedAnswersById = new Map<string, TestAnswer>();
    generated.answers.forEach((answer, index) => {
      const stableId = selected[index].id;
      const latestQuestion = revised.find((question) => question.id === stableId);
      if (latestQuestion) generatedAnswersById.set(stableId, {
        ...answer, questionId: stableId, revision: latestQuestion.revision,
      });
    });
    const oldAnswersById = new Map(currentAnswers.map((answer) => [answer.questionId, answer]));
    const nextAnswers: TestAnswer[] = [];
    for (const question of revised) {
      const generatedAnswer = generatedAnswersById.get(question.id);
      if (generatedAnswer) { nextAnswers.push(generatedAnswer); continue; }
      const previousAnswer = oldAnswersById.get(question.id);
      const previousQuestion = currentQuestions.find((item) => item.id === question.id);
      if (previousAnswer && previousQuestion && !questionChanged(previousQuestion, question))
        nextAnswers.push({ ...previousAnswer, revision: question.revision });
    }

    if (config.includeAnswerKey) validateAnswers(revised, nextAnswers, config);
    const usage = result.usage ?? {};
    const commit = await db.rpc('commit_test_regeneration', {
      p_user: profile.id,
      p_test: id,
      p_expected_version: body.expectedVersion,
      p_title: paper.title,
      p_config: paper.config,
      p_questions: revised.map((question, position) => ({ ...question, position })),
      p_answers: nextAnswers,
      p_warnings: generated.warnings,
      p_request: reservationId,
      p_charge: charge,
      p_usage: {
        model: result.routedModel, provider: result.provider,
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        cost_usd: usage.cost ?? 0,
        latency_ms: Date.now() - started,
      },
    });
    if (commit.error) {
      if (commit.error.message.includes('test_version_conflict'))
        throw new HttpError(409, 'This test was changed in another session. Reload it before regenerating.');
      throw commit.error;
    }
    committed = true;

    const updatedPaper = {
      id, version: body.expectedVersion + 1, config, questions: revised,
    };
    const safePaper = sanitizeStudentPaper(updatedPaper);
    return json({
      paper: safePaper,
      warnings: generated.warnings,
      creditsCharged: charge,
      model: model.id,
      regenerated: selected.map((question) => question.id),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (!committed)
      try { await db.rpc('release_generation', { p_id: reservationId, p_user: profile.id, p_cancelled: false }); } catch { /* best-effort release */ }
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && /unreadable|source/i.test(error.message))
      throw new HttpError(422, error.message, 'source_unreadable');
    throw new HttpError(502, error instanceof Error ? error.message : 'Regeneration failed', 'test_regeneration_failed');
  }
});
