import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { aiRouterFetch } from '@/lib/ai-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

type Context = { params: Promise<{ requestId: string }> };
const Params = z.object({ requestId: z.string().uuid() });

function safeGammaUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.hostname !== 'gamma.app' && !url.hostname.endsWith('.gamma.app'))) return null;
    return url.toString();
  } catch { return null; }
}
function safeExportUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

export const GET = handle(async (_req: NextRequest, context: Context) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('presentations', profile.plan, isAdmin);
  const { requestId } = Params.parse(await context.params);
  const db = adminClient();
  const { data: job, error } = await db.from('generation_requests')
    .select('id,status,reserved,result,expires_at,created_at')
    .eq('id', requestId).eq('user_id', profile.id).eq('kind', 'presentation').maybeSingle();
  if (error) throw error;
  if (!job) throw new HttpError(404, 'Presentation request not found', 'presentation_request_not_found');

  const saved = job.result && typeof job.result === 'object' && !Array.isArray(job.result)
    ? job.result as Record<string, unknown> : {};
  if (job.status === 'completed' && saved.engine === 'gamma')
    return json({ status: 'completed', ...saved }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (job.status === 'failed' || job.status === 'cancelled')
    return json({ status: 'failed', error: typeof saved.error === 'string' ? saved.error : 'Gamma presentation generation failed.' }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (job.status !== 'reserved') throw new HttpError(409, 'This presentation request is no longer active.', 'presentation_request_inactive');

  const gammaGenerationId = typeof saved.gammaGenerationId === 'string' ? saved.gammaGenerationId : '';
  if (!gammaGenerationId) throw new HttpError(409, 'Gamma generation reference is missing. Start a new presentation.', 'gamma_reference_missing');

  if (Date.parse(String(job.expires_at)) <= Date.now()) {
    const message = 'This Gamma generation expired before it could be collected. Your reserved Ilm AI credits have been released.';
    await db.rpc('release_generation', { p_id: requestId, p_user: profile.id, p_cancelled: false });
    await db.from('generation_requests').update({ result: { ...saved, error: message } }).eq('id', requestId).eq('user_id', profile.id);
    return json({ status: 'failed', error: message }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  let gamma: Record<string, unknown>;
  try {
    const response = await aiRouterFetch({
      userId: profile.id,
      path: '/gamma/v1.0/generations/' + encodeURIComponent(gammaGenerationId),
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });
    gamma = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      if (response.status === 401) throw new HttpError(503, 'Gamma rejected the configured API key. Check the Cloudflare Worker GAMMA_API_KEY secret.', 'gamma_unauthorized');
      if (response.status === 429) throw new HttpError(429, 'Gamma is temporarily rate-limiting status checks. Please retry.', 'gamma_rate_limited');
      throw new HttpError(502, 'Gamma could not return this generation status. Please retry.', 'gamma_status_failed');
    }
  } catch (cause) {
    if (cause instanceof HttpError) throw cause;
    throw new HttpError(503, 'Could not reach Gamma to check the presentation status. Please retry.', 'gamma_status_unreachable');
  }

  const state = typeof gamma.status === 'string' ? gamma.status.toLowerCase() : 'pending';
  if (state !== 'completed' && state !== 'failed') {
    return json({ status: 'pending', progress: state }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (state === 'failed') {
    const reason = typeof gamma.message === 'string' ? gamma.message.slice(0, 300) : 'Gamma could not complete this presentation. No Ilm AI credits were charged.';
    await db.rpc('release_generation', { p_id: requestId, p_user: profile.id, p_cancelled: false });
    await db.from('generation_requests').update({ result: { ...saved, error: reason } }).eq('id', requestId).eq('user_id', profile.id);
    return json({ status: 'failed', error: reason }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const gammaUrl = safeGammaUrl(gamma.gammaUrl);
  if (!gammaUrl) {
    const message = 'Gamma marked this generation complete but did not return a valid presentation link.';
    await db.rpc('release_generation', { p_id: requestId, p_user: profile.id, p_cancelled: false });
    await db.from('generation_requests').update({ result: { ...saved, error: message } }).eq('id', requestId).eq('user_id', profile.id);
    return json({ status: 'failed', error: message }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const exportUrl = safeExportUrl(gamma.exportUrl);
  const gammaCredits = gamma.credits && typeof gamma.credits === 'object'
    ? gamma.credits as Record<string, unknown> : {};
  const deducted = Number(gammaCredits.deducted);
  const remaining = Number(gammaCredits.remaining);
  const gammaUsage = {
    deducted: Number.isFinite(deducted) ? deducted : null,
    remaining: Number.isFinite(remaining) ? remaining : null,
  };
  const creditsCharged = Math.max(0, Number(job.reserved) || 0);
  const completed = {
    engine: 'gamma',
    gammaUrl,
    exportUrl,
    exportAs: saved.exportAs ?? null,
    slideCount: Number(saved.slideCount) || null,
    language: saved.language ?? 'English',
    themeId: saved.themeId ?? null,
    imageStyle: saved.imageStyle ?? null,
    gammaCredits,
    gammaCreditsDeducted: gammaUsage.deducted,
    gammaCreditsRemaining: gammaUsage.remaining,
    creditsCharged,
    generatedAt: new Date().toISOString(),
  };

  const createdAt = Date.parse(String(saved.startedAt ?? job.created_at));
  const latencyMs = Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : null;
  const settlement = await db.rpc('settle_generation', {
    p_id: requestId,
    p_user: profile.id,
    p_charge: creditsCharged,
    p_usage: {
      model: 'gamma-api',
      provider: 'gamma',
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      latency_ms: latencyMs,
      provider_usage: { gamma_credits: gammaCredits },
      usage_details: {
        mediaKind: 'presentation',
        slideCount: completed.slideCount,
        language: completed.language,
        exportAs: completed.exportAs,
        gammaCreditsDeducted: gammaUsage.deducted,
        gammaCreditsRemaining: gammaUsage.remaining,
      },
      model_tier: 'external',
      credit_multiplier: 1,
    },
    p_result: completed,
  });
  if (settlement.error) throw settlement.error;
  return json({ status: 'completed', ...completed }, { headers: { 'Cache-Control': 'private, no-store' } });
});
