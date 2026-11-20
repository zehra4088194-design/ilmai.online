import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getAllTextModels, canUseTier } from '@/lib/models';
import { aiRouterChat } from '@/lib/ai-router';
import { adminClient } from '@/lib/supabase/admin';
import { AttachmentIds, attachmentContent, validateAttachments } from '@/lib/attachments';
import { GenerateTestInput, StudioPolicySchema, TestConfigSchema, parseGeneratedTest, sanitizeStudentPaper, testGenerationPrompt } from '@/lib/test-studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const flag = await requireFeature('teacher_tests', profile.plan, isAdmin);
  const parsed = GenerateTestInput.parse(await req.json());
  const { requestId, model: askedModel, ...rawConfig } = parsed;
  const config = TestConfigSchema.parse(rawConfig);
  const ids = AttachmentIds.parse(config.sourceIds);
  const policy = StudioPolicySchema.parse(flag.config ?? {});
  const requested = config.mcq + config.short + config.long;

  if (requested > policy.max_questions) throw new HttpError(400, 'This test exceeds the administrator question limit');
  if (ids.length > policy.max_sources) throw new HttpError(400, 'Too many source files for the current Test Studio settings');
  let sourceFiles: Awaited<ReturnType<typeof validateAttachments>> = [];
  if (ids.length) {
    await requireFeature('file_upload', profile.plan, isAdmin);
    sourceFiles = await validateAttachments(ids, profile.id);
  }
  const needsVision = sourceFiles.some((file) => file.kind === 'image');
  const needsDocuments = sourceFiles.some((file) => file.mime === 'application/pdf');
  const allTextModels = await getAllTextModels();
  const permittedModels = allTextModels.filter((candidate) =>
    (isAdmin || candidate.enabled) &&
    (isAdmin || canUseTier(profile.plan, candidate.tier)) &&
    (!needsVision || candidate.vision) &&
    (!needsDocuments || candidate.documents)
  );
  const preferredId = askedModel ?? policy.default_model;
  const model = (preferredId ? permittedModels.find((candidate) => candidate.id === preferredId) : undefined) ??
    (askedModel ? undefined : permittedModels.find((candidate) => candidate.isDefault) ??
      permittedModels.find((candidate) => candidate.isFree) ?? permittedModels[0]);
  if (!model) {
    if (askedModel) throw new HttpError(400, 'The selected model cannot read the attached sources or is not available on your plan', 'model_unavailable');
    throw new HttpError(400, needsVision || needsDocuments
      ? 'No enabled model on your plan supports these image/PDF sources. Choose a vision/document-capable model or remove the source file.'
      : 'No enabled text model is available on your plan', 'model_unavailable');
  }

  const db = adminClient();
  if (ids.length) {
    const { data: sourceRows, error: sourceError } = await db.from('media_assets')
      .select('id,size_bytes').in('id', ids).eq('user_id', profile.id).eq('status', 'ready');
    if (sourceError) throw sourceError;
    const maxBytes = policy.max_source_mb * 1024 * 1024;
    if ((sourceRows ?? []).length !== ids.length || sourceRows!.some((row) => Number(row.size_bytes) > maxBytes))
      throw new HttpError(413, 'A source file exceeds the current Test Studio size limit');
  }
  const reservationId = randomUUID();
  const amount = isAdmin ? 0 : policy.generation_cost;
  const reservation = await db.rpc('reserve_test_generation', {
    p_id: reservationId, p_user: profile.id, p_key: requestId, p_amount: amount,
    p_daily_limit: isAdmin ? 0 : policy.daily_limit,
    p_monthly_limit: isAdmin ? 0 : policy.monthly_limit,
  });
  if (reservation.error) {
    if (reservation.error.message.includes('insufficient_credits'))
      throw new HttpError(402, 'Not enough credits to generate this test', 'out_of_credits');
    if (reservation.error.message.includes('test_daily_limit'))
      throw new HttpError(429, 'You have reached your daily Test Studio limit', 'daily_test_limit');
    if (reservation.error.message.includes('test_monthly_limit'))
      throw new HttpError(429, 'You have reached your monthly Test Studio limit', 'monthly_test_limit');
    throw reservation.error;
  }
  const reservationData = reservation.data as { status: string; duplicate?: boolean };
  if (reservationData?.duplicate) {
    throw new HttpError(409, reservationData.status === 'completed'
      ? 'This generation request already completed. Open Test Studio history to retrieve it.'
      : 'This generation request is already being processed. Refresh Test Studio shortly.');
  }

  const started = Date.now();
  let savedTestId: string | null = null;
  let settledSuccessfully = false;
  try {
    const userPrompt = [
      config.topic ? 'Topic: ' + config.topic : '',
      config.prompt ? 'Additional instructions: ' + config.prompt : '',
      config.subject ? 'Subject: ' + config.subject : '',
      config.grade ? 'Class/grade: ' + config.grade : '',
      'Generate the test in ' + config.language + ' with difficulty ' + config.difficulty + '.',
    ].filter(Boolean).join('\n');
    const content = ids.length
      ? await attachmentContent(userPrompt, ids, profile.id, { vision: model.vision, documents: model.documents })
      : userPrompt;
    const result = await aiRouterChat({
      userId: profile.id,
      model: model.id,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: testGenerationPrompt(config) },
        { role: 'user', content },
      ],
    });
    const raw = result.choices?.[0]?.message?.content ?? '';
    const actualModel = result.routedModel;
    const actualProvider = result.provider;
    const generated = parseGeneratedTest(raw, config, randomUUID);
    const title = config.title || generated.title;

    const saveResult = await db.rpc('save_test_studio_paper', {
      p_user: profile.id,
      p_test: reservationId,
      p_expected_version: 0,
      p_title: title,
      p_config: { ...config, title },
      p_questions: generated.questions.map((q, position) => ({ ...q, position })),
      p_answers: generated.answers,
      p_warnings: generated.warnings,
    });
    if (saveResult.error) throw saveResult.error;
    savedTestId = reservationId;

    const usage = result.usage ?? {};
    const settlement = await db.rpc('settle_generation', {
      p_id: reservationId,
      p_user: profile.id,
      p_charge: amount,
      p_usage: {
        model: actualModel,
        provider: actualProvider,
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        cost_usd: usage.cost ?? 0,
        latency_ms: Date.now() - started,
      },
      p_result: { testId: reservationId, version: 1 },
    });
    if (settlement.error) throw settlement.error;
    settledSuccessfully = true;

    const paper = sanitizeStudentPaper({
      id: reservationId, version: 1, config: { ...config, title },
      questions: generated.questions,
    });
    return json({ paper, warnings: generated.warnings, creditsCharged: amount, model: actualModel });
  } catch (error) {
    if (!settledSuccessfully) {
      try { await db.rpc('release_generation', { p_id: reservationId, p_user: profile.id, p_cancelled: false }); } catch { /* best-effort release */ }
      if (savedTestId) await db.from('test_papers').delete().eq('id', savedTestId).eq('user_id', profile.id);
    }
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && /unreadable|source/i.test(error.message))
      throw new HttpError(422, error.message, 'source_unreadable');
    throw new HttpError(502, error instanceof Error ? error.message : 'Test generation failed. No credits were charged.', 'test_generation_failed');
  }
});
