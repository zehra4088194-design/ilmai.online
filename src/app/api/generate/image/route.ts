import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { putObject, readObject, signedDownloadUrl } from '@/lib/storage/b2';
import { creditsFor } from '@/lib/credits';
import { getImageModel, supports, enumValues, type ImageOutput } from '@/lib/image-models';
import { AttachmentIds, validateAttachments } from '@/lib/attachments';
import { aiRouterFetch } from '@/lib/ai-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  requestId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(6000),
  model: z.string().trim().min(3).max(200).optional(),
  aspectRatio: z.string().max(16).optional(),
  resolution: z.string().max(12).optional(),
  quality: z.string().max(20).optional(),
  outputFormat: z.enum(['png','jpeg','webp','svg']).optional(),
  background: z.enum(['auto','transparent','opaque']).optional(),
  count: z.number().int().min(1).max(10).default(1),
  referenceAssetIds: z.array(z.string().uuid()).max(4).default([]),
}).strict().refine((value) => new Set(value.referenceAssetIds).size === value.referenceAssetIds.length, 'Duplicate reference images');

type OpenRouterImage = { b64_json?: string; media_type?: string };
type ImageResponse = { data?: OpenRouterImage[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };

function requireCapability(model: ImageOutput, field: string, value: string | undefined) {
  if (value === undefined) return;
  if (!supports(model, field)) throw new HttpError(400, 'The selected model does not support ' + field, 'image_parameter_unsupported');
  const allowed = enumValues(model, field);
  if (allowed.length && !allowed.includes(value))
    throw new HttpError(400, 'The selected model does not support ' + value + ' for ' + field, 'image_parameter_invalid');
}

function contentType(format: string | undefined, mediaType: string | undefined) {
  const mime = mediaType?.toLowerCase();
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/svg+xml') return mime;
  return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : format === 'svg' ? 'image/svg+xml' : 'image/png';
}
function extension(mime: string) {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : mime === 'image/svg+xml' ? 'svg' : 'png';
}
function validateImageBytes(bytes: Buffer, mime: string) {
  const ok =
    (mime === 'image/png' && bytes.length > 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (mime === 'image/jpeg' && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (mime === 'image/webp' && bytes.length > 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') ||
    (mime === 'image/svg+xml' && bytes.toString('utf8',0,512).toLowerCase().includes('<svg'));
  if (!ok) throw new HttpError(502, 'The image provider returned a file with an invalid format', 'invalid_image_output');
}

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('image_generation', profile.plan, isAdmin);
  const body = Body.parse(await req.json());
  const config = feature.config ?? {};
  const allowedModels = Array.isArray(config.allowed_models) ? config.allowed_models.filter((x): x is string => typeof x === 'string') : [];
  const modelId = body.model ?? (typeof config.default_model === 'string' ? config.default_model : undefined);
  if (!modelId) throw new HttpError(400, 'Choose an image model first', 'image_model_required');
  if (allowedModels.length && !allowedModels.includes(modelId) && !isAdmin)
    throw new HttpError(403, 'This image model is disabled by the administrator', 'image_model_disabled');

  const model = await getImageModel(modelId);
  requireCapability(model, 'aspect_ratio', body.aspectRatio);
  requireCapability(model, 'resolution', body.resolution);
  requireCapability(model, 'quality', body.quality);
  requireCapability(model, 'output_format', body.outputFormat);
  requireCapability(model, 'background', body.background);
  if (body.count > 1 && !supports(model, 'n'))
    throw new HttpError(400, 'This model only supports one image per request', 'image_count_unsupported');
  if (body.referenceAssetIds.length && (!supports(model, 'input_references') || !model.inputModalities.includes('image')))
    throw new HttpError(400, 'This model does not support reference image editing', 'image_reference_unsupported');

  const refs = body.referenceAssetIds.length ? await validateAttachments(body.referenceAssetIds, profile.id) : [];
  if (refs.some((asset) => asset.kind !== 'image' || !asset.mime?.startsWith('image/')))
    throw new HttpError(400, 'Only image files may be used as image-generation references');
  const maxSourceBytes = (Number(config.max_reference_mb) > 0 ? Number(config.max_reference_mb) : 12) * 1024 * 1024;
  const referenceRows = body.referenceAssetIds.length
    ? await adminClient().from('media_assets').select('id,storage_key,size_bytes,mime')
      .in('id', body.referenceAssetIds).eq('user_id', profile.id).eq('status', 'ready')
    : { data: [], error: null };
  if (referenceRows.error) throw referenceRows.error;
  if ((referenceRows.data ?? []).length !== body.referenceAssetIds.length)
    throw new HttpError(404, 'One or more reference images are unavailable');

  const referenceImages = await Promise.all((referenceRows.data ?? []).map(async (asset) => {
    const bytes = await readObject(asset.storage_key, Number(asset.size_bytes), asset.mime, maxSourceBytes);
    return { type: 'image_url', image_url: { url: 'data:' + asset.mime + ';base64,' + bytes.toString('base64') } };
  }));

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
  try {
    const payload: Record<string, unknown> = {
      model: model.id,
      prompt: body.prompt,
      n: body.count,
    };
    if (body.aspectRatio) payload.aspect_ratio = body.aspectRatio;
    if (body.resolution) payload.resolution = body.resolution;
    if (body.quality) payload.quality = body.quality;
    if (body.outputFormat) payload.output_format = body.outputFormat;
    if (body.background) payload.background = body.background;
    if (referenceImages.length) payload.input_references = referenceImages;
    if (model.endpoint?.provider_slug) payload.provider = { only: [model.endpoint.provider_slug], allow_fallbacks: false };

    const upstream = await aiRouterFetch({
      userId: profile.id,
      path: '/v1/images',
      body: payload,
      signal: AbortSignal.timeout(240000),
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      let message = 'Image generation provider error (' + upstream.status + ')';
      try { message = JSON.parse(raw)?.error?.message ?? message; } catch { /* keep generic error */ }
      throw new HttpError(502, message.slice(0, 500), 'image_provider_error');
    }
    let result: ImageResponse;
    try { result = JSON.parse(raw) as ImageResponse; } catch { throw new HttpError(502, 'Image provider returned invalid JSON'); }
    if (!Array.isArray(result.data) || result.data.length === 0)
      throw new HttpError(502, 'Image provider returned no images', 'empty_image_response');

    const images = result.data.slice(0, body.count);
    if (images.length !== body.count)
      throw new HttpError(502, 'Image provider returned fewer images than requested', 'incomplete_image_response');
    const saved = await Promise.all(images.map(async (item, index) => {
      if (!item.b64_json || item.b64_json.length > 30 * 1024 * 1024)
        throw new HttpError(502, 'Image provider returned an empty or oversized image');
      const mime = contentType(body.outputFormat, item.media_type);
      const bytes = Buffer.from(item.b64_json, 'base64');
      if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new HttpError(502, 'Generated image is too large');
      validateImageBytes(bytes, mime);
      const storageKey = 'generated/' + profile.id + '/image/' + randomUUID() + '.' + extension(mime);
      await putObject(storageKey, bytes, mime);
      const insert = await db.from('media_assets').insert({
        user_id: profile.id, kind: 'image', storage_key: storageKey, mime,
        size_bytes: bytes.length, prompt: body.prompt, model: model.id, status: 'ready',
        meta: {
          request_id: requestId, index: index + 1, aspect_ratio: body.aspectRatio ?? null,
          resolution: body.resolution ?? null, quality: body.quality ?? null, reference_asset_ids: body.referenceAssetIds,
        },
      }).select('id,kind,mime,size_bytes,storage_key,created_at').single();
      if (insert.error) {
        try { await (await import('@/lib/storage/b2')).deleteObject(storageKey); } catch { /* best-effort storage cleanup */ }
        throw insert.error;
      }
      return {
        id: insert.data.id, kind: insert.data.kind, mime: insert.data.mime,
        sizeBytes: insert.data.size_bytes, createdAt: insert.data.created_at,
        url: await signedDownloadUrl(insert.data.storage_key, 300),
      };
    }));

    const usage = result.usage ?? {};
    const output = {
      assets: saved,
      model: model.id,
      creditsCharged: reservedCredits,
      usage: { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0, costUsd: usage.cost ?? 0 },
    };
    const settlement = await db.rpc('settle_generation', {
      p_id: requestId,
      p_user: profile.id,
      p_charge: reservedCredits,
      p_usage: {
        model: model.id, provider: model.endpoint?.provider_slug ?? 'openrouter-image-api',
        prompt_tokens: usage.prompt_tokens ?? 0, completion_tokens: usage.completion_tokens ?? 0,
        cost_usd: usage.cost ?? model.priceUsd ?? 0, latency_ms: Date.now() - started,
      },
      p_result: output,
    });
    if (settlement.error) throw settlement.error;
    settled = true;
    return json(output, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (!settled) {
      try { await db.rpc('release_generation', { p_id: requestId, p_user: profile.id, p_cancelled: false }); }
      catch { /* best-effort release after a failed generation */ }
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : 'Image generation failed', 'image_generation_failed');
  }
});
