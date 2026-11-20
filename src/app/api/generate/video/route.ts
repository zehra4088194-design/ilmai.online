import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { aiRouterFetch } from '@/lib/ai-router';
import { getVideoModels, videoModelPrice } from '@/lib/video-models';
import { signedDownloadUrl } from '@/lib/storage/b2';
import { validateAttachments } from '@/lib/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  requestId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(6000),
  model: z.string().trim().min(1).max(200).optional(),
  duration: z.number().int().min(1).max(120).optional(),
  aspectRatio: z.string().max(16).optional(),
  resolution: z.string().max(16).optional(),
  generateAudio: z.boolean().optional(),
  firstFrameAssetId: z.string().uuid().optional(),
}).strict();

type ProviderJob = { id?: string; polling_url?: string; status?: string; error?: string };

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('video_generation', profile.plan, isAdmin);
  const body = Body.parse(await req.json());
  const config = feature.config ?? {};
  const creditsPerSecond = Number(config.credits_per_second ?? 0);
  if (!Number.isSafeInteger(creditsPerSecond) || creditsPerSecond <= 0)
    throw new HttpError(503, 'Video credit pricing has not been configured by the administrator', 'video_pricing_unconfigured');

  const models = await getVideoModels();
  const allowed = Array.isArray(config.allowed_models)
    ? config.allowed_models.filter((value): value is string => typeof value === 'string')
    : [];
  const candidates = models.filter((model) => !allowed.length || allowed.includes(model.id));
  const requestedModel = body.model ?? (typeof config.default_model === 'string' ? config.default_model : 'auto');
  const durationLimit = Math.max(1, Math.min(120, Number(config.max_duration_seconds ?? 30)));
  const referenceFiles = body.firstFrameAssetId
    ? await validateAttachments([body.firstFrameAssetId], profile.id)
    : [];
  if (referenceFiles.some((file) => file.kind !== 'image' || !file.mime?.startsWith('image/')))
    throw new HttpError(400, 'The first-frame reference must be an image');

  const capable = candidates.filter((model) =>
    (body.duration === undefined || model.supported_durations.includes(body.duration)) &&
    (body.aspectRatio === undefined || model.supported_aspect_ratios.includes(body.aspectRatio)) &&
    (body.resolution === undefined || model.supported_resolutions.includes(body.resolution)) &&
    (!body.generateAudio || model.generate_audio) &&
    (!body.firstFrameAssetId || model.supported_frame_images.includes('first_frame'))
  );
  const selected = requestedModel === 'auto'
    ? capable.slice().sort((a,b) => videoModelPrice(a)-videoModelPrice(b))[0]
    : capable.find((model) => model.id === requestedModel);
  if (!selected) {
    if (requestedModel !== 'auto' && !candidates.some((model) => model.id === requestedModel))
      throw new HttpError(400, 'This video model is not enabled by the administrator', 'video_model_disabled');
    throw new HttpError(400, 'No enabled model supports the requested duration, ratio, resolution, audio or reference image', 'video_capability_mismatch');
  }

  const duration = body.duration ?? selected.supported_durations[0];
  if (!duration || duration > durationLimit)
    throw new HttpError(400, 'This video duration exceeds the administrator limit', 'video_duration_limit');
  const creditAmount = creditsPerSecond * duration;
  if (!Number.isSafeInteger(creditAmount) || creditAmount <= 0)
    throw new HttpError(400, 'The configured video credit amount is invalid');

  const db = adminClient();
  const maxJobs = Math.max(1, Math.min(10, Number(config.max_concurrent_jobs ?? 2)));
  const { count: activeJobs, error: countError } = await db.from('video_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .in('status', ['queued','submitted','processing','downloading','storing']);
  if (countError) throw countError;
  if ((activeJobs ?? 0) >= maxJobs) throw new HttpError(429, 'You already have the maximum number of active video jobs', 'video_job_limit');

  const reservationId = randomUUID();
  const reservation = await db.rpc('reserve_generation', {
    p_id: reservationId, p_user: profile.id, p_key: body.requestId, p_kind: 'video', p_amount: isAdmin ? 0 : creditAmount,
  });
  if (reservation.error) {
    if (reservation.error.message.includes('insufficient_credits'))
      throw new HttpError(402, 'Not enough credits for this video duration', 'out_of_credits');
    throw reservation.error;
  }
  const reserved = reservation.data as { id: string; status: string; duplicate?: boolean; result?: { jobId?: string } | null };
  if (reserved.duplicate) {
    const { data: existing } = await db.from('video_jobs').select('id,status,model,prompt,config,created_at')
      .eq('user_id', profile.id).eq('generation_request_id', reserved.id).maybeSingle();
    if (!existing) throw new HttpError(409, 'This video request is already being submitted. Retry shortly.');
    return json({ job: existing, duplicate: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const reservedAmount = isAdmin ? 0 : creditAmount;
  const { data: queued, error: insertError } = await db.from('video_jobs').insert({
    id: reservationId,
    user_id: profile.id,
    request_key: body.requestId,
    generation_request_id: reservationId,
    provider_job_id: 'pending:' + reservationId,
    model: selected.id,
    prompt: body.prompt,
    config: {
      duration,
      aspect_ratio: body.aspectRatio ?? selected.supported_aspect_ratios[0] ?? null,
      resolution: body.resolution ?? selected.supported_resolutions[0] ?? null,
      generate_audio: body.generateAudio ?? false,
      first_frame_asset_id: body.firstFrameAssetId ?? null,
    },
    status: 'queued',
    credits_reserved: reservedAmount,
  }).select('id,status,model,prompt,config,created_at').single();
  if (insertError) {
    await db.rpc('release_generation', { p_id: reservationId, p_user: profile.id, p_cancelled: false });
    throw insertError;
  }

  try {
    const request: Record<string, unknown> = {
      model: selected.id,
      prompt: body.prompt,
      duration,
      generate_audio: body.generateAudio ?? false,
    };
    const ratio = body.aspectRatio ?? selected.supported_aspect_ratios[0];
    const resolution = body.resolution ?? selected.supported_resolutions[0];
    if (ratio) request.aspect_ratio = ratio;
    if (resolution) request.resolution = resolution;

    if (body.firstFrameAssetId) {
      const { data: asset, error } = await db.from('media_assets')
        .select('storage_key').eq('id', body.firstFrameAssetId).eq('user_id', profile.id).eq('status', 'ready').maybeSingle();
      if (error) throw error;
      if (!asset) throw new HttpError(404, 'Reference image not found');
      const url = await signedDownloadUrl(asset.storage_key, 300);
      request.frame_images = [{ type: 'image_url', image_url: { url }, frame_type: 'first_frame' }];
    }

    const response = await aiRouterFetch({
      userId: profile.id, path: '/v1/videos', body: request, signal: AbortSignal.timeout(45000),
    });
    const responseText = await response.text();
    if (!response.ok) {
      let message = 'Video provider error (' + response.status + ')';
      try { message = JSON.parse(responseText)?.error?.message ?? message; } catch { /* retain safe summary */ }
      throw new HttpError(502, message.slice(0,500), 'video_provider_error');
    }
    let providerJob: ProviderJob;
    try { providerJob = JSON.parse(responseText) as ProviderJob; }
    catch { throw new HttpError(502, 'Video provider returned invalid job data'); }
    if (!providerJob.id || providerJob.id.length > 250)
      throw new HttpError(502, 'Video provider did not return a job ID');
    const { data: submitted, error } = await db.from('video_jobs').update({
      provider_job_id: providerJob.id,
      status: providerJob.status === 'processing' ? 'processing' : 'submitted',
      updated_at: new Date().toISOString(),
    }).eq('id', reservationId).eq('user_id', profile.id).select('id,status,model,prompt,config,created_at').single();
    if (error) throw error;
    await db.from('generation_requests').update({
      result: { videoJobId: reservationId, providerJobId: providerJob.id },
    }).eq('id', reservationId).eq('user_id', profile.id).eq('status', 'reserved');
    return json({ job: submitted, duplicate: false }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    await db.rpc('fail_video_job', {
      p_job: reservationId,
      p_user: profile.id,
      p_status: 'failed',
      p_error: error instanceof Error ? error.message : 'Video generation submission failed',
    }).catch(() => undefined);
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : 'Could not submit video generation', 'video_submit_failed');
  }
});
