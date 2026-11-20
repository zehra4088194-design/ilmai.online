import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getModel, getDefaultModelId, canUseTier } from '@/lib/models';
import { orChat } from '@/lib/openrouter';
import { adminClient } from '@/lib/supabase/admin';
import { AttachmentIds, attachmentContent } from '@/lib/attachments';
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
  if (ids.length) await requireFeature('file_upload', profile.plan, isAdmin);

  const modelId = askedModel ?? policy.default_model ?? await getDefaultModelId();
  const model = await getModel(modelId);
  if (!model || (!model.enabled && !isAdmin) || !model.outputModalities.includes('text'))
    throw new HttpError(400, 'The selected model cannot generate test content', 'model_unavailable');
  if (!isAdmin && !canUseTier(profile.plan, model.tier))
    throw new HttpError(403, 'This model requires the ' + model.tier + ' plan', 'plan_required');

  const db = adminClient();
  if (!isAdmin && policy.daily_limit > 0) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await db.from('usage_events').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('kind', 'test').gte('created_at', since);
    if ((count ?? 0) >= policy.daily_limit) throw new HttpError(429, 'You have reached your daily Test Studio limit');
  }
  if (!isAdmin && policy.monthly_limit > 0) {
    const since = new Date();
    since.setDate(1); since.setHours(0, 0, 0, 0);
    const { count } = await db.from('usage_events').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('kind', 'test').gte('created_at', since.toISOString());
    if ((count ?? 0) >= policy.monthly_limit) throw new HttpError(429, 'You have reached your monthly Test Studio limit');
  }

  const reservationId = randomUUID();
  const amount = isAdmin ? 0 : policy.generation_cost;
  const reservation = await db.rpc('reserve_generation', {
    p_id: reservationId, p_user: profile.id, p_key: requestId, p_kind: 'test', p_amount: amount,
  });
  if (reservation.error) {
    if (reservation.error.message.includes('insufficient_credits'))
      throw new HttpError(402, 'Not enough credits to generate this test', 'out_of_credits');
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
    const result = await orChat({
      model: model.id,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: testGenerationPrompt(config) },
        { role: 'user', content },
      ],
    });
    const raw = result.choices?.[0]?.message?.content ?? '';
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
        model: model.id,
        provider: model.provider,
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
    return json({ paper, warnings: generated.warnings, creditsCharged: amount, model: model.id });
  } catch (error) {
    if (!settledSuccessfully) {
      await db.rpc('release_generation', { p_id: reservationId, p_user: profile.id, p_cancelled: false }).catch(() => undefined);
      if (savedTestId) await db.from('test_papers').delete().eq('id', savedTestId).eq('user_id', profile.id);
    }
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && /unreadable|source/i.test(error.message))
      throw new HttpError(422, error.message, 'source_unreadable');
    throw new HttpError(502, error instanceof Error ? error.message : 'Test generation failed. No credits were charged.', 'test_generation_failed');
  }
});
