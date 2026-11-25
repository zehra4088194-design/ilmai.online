import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { signedDownloadUrl, deleteObject } from '@/lib/storage/b2';
import { getImageModel, supports, enumValues } from '@/lib/image-models';
import { validateAttachments } from '@/lib/attachments';
import {
  buildPicsartParams,
  picsartParamRange,
  transferPicsartAsset,
  extractPicsartResponse,
  picsartExecuteModel,
  picsartPollModel,
  picsartSubmitModel,
} from '@/lib/picsart-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  requestId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(6000),
  negativePrompt: z.string().trim().max(1200).optional(),
  model: z.string().trim().min(3).max(200).optional(),
  aspectRatio: z.string().max(24).optional(),
  resolution: z.string().max(16).optional(),
  quality: z.string().max(20).optional(),
  outputFormat: z.enum(['png','jpeg','webp','avif']).optional(),
  background: z.string().max(24).optional(),
  count: z.number().int().min(1).max(10).default(1),
  referenceAssetIds: z.array(z.string().uuid()).max(4).default([]),
}).strict().refine((value) => new Set(value.referenceAssetIds).size === value.referenceAssetIds.length, 'Duplicate reference images');

function requireCapability(model: Awaited<ReturnType<typeof getImageModel>>, field: string, value: string | undefined) {
  if (value === undefined) return;
  if (!supports(model, field)) throw new HttpError(400, 'The selected Picsart model does not support ' + field, 'image_parameter_unsupported');
  const allowed = enumValues(model, field);
  if (allowed.length && !allowed.includes(value))
    throw new HttpError(400, 'The selected model does not support ' + value + ' for ' + field, 'image_parameter_invalid');
}

function imageUrlsFrom(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const value = result as Record<string, unknown>;
  const items = Array.isArray(value.items) ? value.items : Array.isArray(value.results) ? value.results : [];
  const urls = items.flatMap((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string'
    ? [(item as Record<string, unknown>).url as string] : []);
  if (typeof value.url === 'string') urls.unshift(value.url);
  return [...new Set(urls)];
}

async function waitForImageJob(userId: string, jobId: string) {
  const deadline = Date.now() + 230_000;
  let latest = await picsartPollModel(userId, jobId, 45_000);
  while (latest.status !== 'COMPLETED') {
    if (latest.status === 'FAILED') {
      throw new HttpError(502, latest.error || 'Picsart image generation failed', 'picsart_generation_failed');
    }
    if (!['ACCEPTED','IN_PROGRESS',''].includes(latest.status)) {
      throw new HttpError(502, 'Picsart returned an unknown generation status: ' + latest.status, 'picsart_unknown_status');
    }
    if (Date.now() >= deadline) throw new HttpError(504, 'Picsart image generation timed out. The job may still finish on the provider.', 'picsart_generation_timeout');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    latest = await picsartPollModel(userId, jobId, 45_000);
  }
  return latest;
}

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('image_generation', profile.plan, isAdmin);
  const body = Body.parse(await req.json());
  const config = feature.config ?? {};
  const disabled = Array.isArray(config.disabled_models) ? config.disabled_models.filter((id): id is string => typeof id === 'string') : [];
  const legacyAllowed = Array.isArray(config.allowed_models) ? config.allowed_models.filter((id): id is string => typeof id === 'string') : [];
  const modelId = body.model ?? (typeof config.default_model === 'string' ? config.default_model : undefined);
  if (!modelId) throw new HttpError(400, 'Choose a Picsart image model first', 'image_model_required');
  if (disabled.includes(modelId) || (legacyAllowed.length > 0 && !legacyAllowed.includes(modelId))) {
    throw new HttpError(403, 'This image model is disabled by the administrator', 'image_model_disabled');
  }

  const model = await getImageModel(modelId, profile.id);
  requireCapability(model, 'aspect_ratio', body.aspectRatio);
  requireCapability(model, 'resolution', body.resolution);
  requireCapability(model, 'quality', body.quality);
  requireCapability(model, 'output_format', body.outputFormat);
  if (body.count > 1 && !supports(model, 'n')) {
    throw new HttpError(400, 'This Picsart model only supports one image per request', 'image_count_unsupported');
  }
  const countOptions = enumValues(model, 'count');
  const countRange = picsartParamRange(model, 'count');
  if (countOptions.length && !countOptions.includes(String(body.count))) {
    throw new HttpError(400, 'The selected model does not support requesting ' + body.count + ' images', 'image_count_invalid');
  }
  if (countRange && (body.count < countRange.min || body.count > countRange.max || (body.count - countRange.min) % countRange.step !== 0)) {
    throw new HttpError(400, 'The requested image count is outside this model’s supported range', 'image_count_invalid');
  }

  const refs = body.referenceAssetIds.length ? await validateAttachments(body.referenceAssetIds, profile.id) : [];
  if (refs.some((asset) => asset.kind !== 'image' || !asset.mime?.startsWith('image/'))) {
    throw new HttpError(400, 'Only image files may be used as image-generation references');
  }
  const referenceRows = body.referenceAssetIds.length
    ? await adminClient().from('media_assets').select('id,storage_key,status,kind,mime')
      .in('id', body.referenceAssetIds).eq('user_id', profile.id).eq('status', 'ready')
    : { data: [], error: null };
  if (referenceRows.error) throw referenceRows.error;
  if ((referenceRows.data ?? []).length !== body.referenceAssetIds.length) {
    throw new HttpError(404, 'One or more reference images are unavailable');
  }
  const imageUrls = await Promise.all((referenceRows.data ?? []).map((asset) => signedDownloadUrl(asset.storage_key, 300)));
  if (imageUrls.length && !supports(model, 'imageUrls')) {
    throw new HttpError(400, 'This Picsart model does not support reference images', 'image_reference_unsupported');
  }

  const providerParams = buildPicsartParams(model, {
    prompt: body.prompt,
    negativePrompt: body.negativePrompt,
    aspectRatio: body.aspectRatio,
    resolution: body.resolution,
    quality: body.quality,
    outputFormat: body.outputFormat,
    background: body.background,
    count: body.count,
    imageUrls: imageUrls.length ? imageUrls : undefined,
  });

  const costPerImage = Number.isSafeInteger(Number(config.generation_cost)) && Number(config.generation_cost) >= 0
    ? Number(config.generation_cost) : 10;
  const reservedCredits = isAdmin ? 0 : costPerImage * body.count;
  const requestId = randomUUID();
  const db = adminClient();
  const reservation = await db.rpc('reserve_generation', {
    p_id: requestId, p_user: profile.id, p_key: body.requestId, p_kind: 'image', p_amount: reservedCredits,
  });
  if (reservation.error) {
    if (reservation.error.message.includes('insufficient_credits'))
      throw new HttpError(402, 'Not enough credits to generate these images', 'out_of_credits');
    throw reservation.error;
  }
  const reserveData = reservation.data as { status?: string; duplicate?: boolean; result?: { assets?: unknown[] } };
  if (reserveData?.duplicate) {
    if (reserveData.status === 'completed' && Array.isArray(reserveData.result?.assets))
      return json(reserveData.result, { headers: { 'Cache-Control': 'private, no-store' } });
    throw new HttpError(409, 'This image request is already being processed');
  }

  const started = Date.now();
  let settled = false;
  const createdStorageKeys: string[] = [];
  try {
    const result = model.syncExecute
      ? await picsartExecuteModel(profile.id, model, providerParams)
      : await (async () => {
          const jobId = await picsartSubmitModel(profile.id, model, providerParams);
          return waitForImageJob(profile.id, jobId);
        })();
    const imageUrls = imageUrlsFrom(result.result);
    if (imageUrls.length === 0) throw new HttpError(502, 'Picsart completed the request but returned no image URL', 'empty_image_response');
    if (imageUrls.length < body.count) throw new HttpError(502, 'Picsart returned fewer images than requested', 'incomplete_image_response');

    const saved = await Promise.all(imageUrls.slice(0, body.count).map(async (url, index) => {
      const transferred = await transferPicsartAsset(profile.id, url, 20 * 1024 * 1024, 'image');
      createdStorageKeys.push(transferred.storageKey);
      const insert = await db.from('media_assets').insert({
        user_id: profile.id, kind: 'image', storage_key: transferred.storageKey, mime: transferred.mime,
        size_bytes: transferred.sizeBytes, prompt: body.prompt, model: model.id, status: 'ready',
        meta: {
          request_id: requestId, index: index + 1, aspect_ratio: body.aspectRatio ?? null,
          resolution: body.resolution ?? null, quality: body.quality ?? null,
          reference_asset_ids: body.referenceAssetIds, provider: 'picsart',
        },
      }).select('id,kind,mime,size_bytes,storage_key,created_at').single();
      if (insert.error) throw insert.error;
      return {
        id: insert.data.id, kind: insert.data.kind, mime: insert.data.mime,
        sizeBytes: insert.data.size_bytes, createdAt: insert.data.created_at,
        url: await signedDownloadUrl(insert.data.storage_key, 300),
      };
    }));

    const providerCredits = Number(result.usage?.credits ?? 0);
    const output = {
      assets: saved,
      model: model.id,
      creditsCharged: reservedCredits,
      usage: { provider: 'picsart', providerCredits: Number.isFinite(providerCredits) ? providerCredits : 0, durationMs: Date.now() - started },
    };
    const settlement = await db.rpc('settle_generation', {
      p_id: requestId,
      p_user: profile.id,
      p_charge: reservedCredits,
      p_usage: {
        model: model.id, provider: 'picsart-image-api',
        prompt_tokens: 0, completion_tokens: 0,
        cost_usd: 0, latency_ms: Date.now() - started,
        provider_usage: result.usage ?? {},
        usage_details: {
          mediaKind: 'image', count: saved.length, requestedCount: body.count,
          aspectRatio: body.aspectRatio ?? null, resolution: body.resolution ?? null,
          quality: body.quality ?? null, outputFormat: body.outputFormat ?? null,
        },
        model_tier: 'media', credit_multiplier: 1,
      },
      p_result: output,
    });
    if (settlement.error) throw settlement.error;
    settled = true;
    return json(output, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    for (const key of createdStorageKeys) {
      try { await deleteObject(key); } catch { /* best-effort cleanup */ }
    }
    if (!settled) {
      try { await db.rpc('release_generation', { p_id: requestId, p_user: profile.id, p_cancelled: false }); }
      catch { /* best-effort release after a failed generation */ }
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : 'Image generation failed', 'image_generation_failed');
  }
});
