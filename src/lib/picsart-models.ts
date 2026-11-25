import 'server-only';
import { randomUUID } from 'crypto';
import { deleteObject, signedGeneratedUploadUrl } from '@/lib/storage/b2';

import { z } from 'zod';
import { aiRouterFetch } from '@/lib/ai-router';
import { HttpError } from '@/lib/http';

export type PicsartMode = 'image' | 'video';
export type PicsartParam = {
  kind?: string;
  valueType?: string;
  options?: Array<{ id?: string | number; label?: string } | string | number>;
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;
  [key: string]: unknown;
};
export type PicsartModel = {
  id: string;
  name: string;
  description: string;
  mode: PicsartMode;
  inputType: string;
  provider: { id: string; name: string; color: string; label: string };
  params: Record<string, PicsartParam>;
  features: Array<{ label: string; variant: string }>;
  release?: string;
  deprecated: boolean;
  syncExecute: boolean;
};

const ModelSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().nullish(),
  description: z.string().nullish(),
  mode: z.enum(['image', 'video']),
  inputType: z.string().nullish(),
  provider: z.object({
    id: z.string().nullish(),
    name: z.string().nullish(),
    color: z.string().nullish(),
    label: z.string().nullish(),
  }).passthrough().nullish(),
  params: z.record(z.string(), z.unknown()).nullish(),
  features: z.array(z.object({ label: z.string(), variant: z.string() }).passthrough()).nullish(),
  release: z.string().nullish(),
  deprecated: z.boolean().nullish(),
  syncExecute: z.boolean().nullish(),
}).passthrough();

const CatalogSchema = z.object({
  status: z.string().optional(),
  response: z.object({
    total: z.number().optional(),
    models: z.array(z.unknown()),
  }).passthrough(),
}).passthrough();

const catalogCache = new Map<PicsartMode, { expiresAt: number; models: PicsartModel[] }>();
const TTL_MS = 60_000;

export async function picsartFetch(input: {
  userId: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}) {
  const response = await aiRouterFetch({
    userId: input.userId,
    path: '/picsart' + input.path,
    method: input.method ?? 'GET',
    body: input.body,
    signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
  }).catch((error) => {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'Picsart API could not be reached through the AI gateway', 'picsart_unavailable');
  });
  return response;
}

export async function getPicsartModels(mode: PicsartMode, userId = 'model-catalog', force = false): Promise<PicsartModel[]> {
  const cached = catalogCache.get(mode);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.models;

  const query = new URLSearchParams({
    include: 'schema,constraints,routing',
    mode,
    release: 'preview,production,general-availability',
  });
  const response = await picsartFetch({
    userId,
    path: '/gw-v2/v1/models-catalog?' + query.toString(),
    method: 'GET',
    timeoutMs: 30_000,
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof raw?.message === 'string' ? raw.message : 'Picsart model catalogue request failed (' + response.status + ')';
    throw new HttpError(response.status >= 500 ? 503 : response.status, detail.slice(0, 400), 'picsart_catalog_unavailable');
  }
  const parsed = CatalogSchema.safeParse(raw);
  if (!parsed.success || parsed.data.status && parsed.data.status !== 'success') {
    console.error('[picsart-catalog] Invalid catalogue response:', parsed.success ? parsed.data.status : parsed.error.issues.slice(0, 8));
    throw new HttpError(502, 'Picsart returned an invalid model catalogue response', 'invalid_picsart_catalog');
  }

  const models: PicsartModel[] = [];
  for (const entry of parsed.data.response.models) {
    const model = ModelSchema.safeParse(entry);
    if (!model.success || model.data.mode !== mode || model.data.deprecated) continue;
    const provider = model.data.provider ?? {};
    const params = model.data.params ?? {};
    models.push({
      id: model.data.id,
      name: model.data.name?.trim() || model.data.id,
      description: model.data.description ?? '',
      mode,
      inputType: model.data.inputType ?? '',
      provider: {
        id: provider.id ?? 'unknown',
        name: provider.name ?? provider.id ?? 'Unknown provider',
        color: provider.color ?? '',
        label: provider.label ?? '',
      },
      params: params as Record<string, PicsartParam>,
      features: model.data.features ?? [],
      release: model.data.release ?? undefined,
      deprecated: false,
      syncExecute: model.data.syncExecute ?? false,
    });
  }
  models.sort((a, b) => a.provider.name.localeCompare(b.provider.name) || a.name.localeCompare(b.name));
  if (!models.length) throw new HttpError(502, 'Picsart returned no active ' + mode + ' models', 'empty_picsart_catalog');
  catalogCache.set(mode, { expiresAt: Date.now() + TTL_MS, models });
  return models;
}

export async function getPicsartModel(mode: PicsartMode, id: string, userId = 'model-catalog') {
  const models = await getPicsartModels(mode, userId);
  const model = models.find((item) => item.id === id);
  if (!model) throw new HttpError(400, 'The selected Picsart ' + mode + ' model is not available', 'picsart_model_unavailable');
  return model;
}

function normalizedKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const PARAM_ALIASES: Record<string, string[]> = {
  prompt: ['prompt'],
  negativePrompt: ['negativePrompt', 'negative_prompt'],
  aspectRatio: ['aspectRatio', 'aspect_ratio'],
  resolution: ['resolution'],
  quality: ['quality'],
  count: ['count', 'n'],
  outputFormat: ['outputFormat', 'output_format'],
  background: ['background'],
  duration: ['duration'],
  generateAudio: ['generateAudio', 'generate_audio'],
  imageUrls: ['imageUrls', 'image_urls'],
  startFrame: ['startFrame', 'start_frame'],
  endFrame: ['endFrame', 'end_frame'],
};

export function findPicsartParam(model: PicsartModel, name: string): string | null {
  const aliases = PARAM_ALIASES[name] ?? [name];
  const accepted = new Set(aliases.map(normalizedKey));
  return Object.keys(model.params).find((key) => accepted.has(normalizedKey(key))) ?? null;
}

export function hasPicsartParam(model: PicsartModel, name: string) {
  return findPicsartParam(model, name) !== null;
}

export function picsartParamOptions(model: PicsartModel, name: string): Array<string | number> {
  const key = findPicsartParam(model, name);
  if (!key) return [];
  const descriptor = model.params[key];
  if (!Array.isArray(descriptor.options)) return [];
  return descriptor.options.flatMap((option) => {
    if (typeof option === 'string' || typeof option === 'number') return [option];
    if (option && typeof option === 'object' && ('id' in option) &&
        (typeof option.id === 'string' || typeof option.id === 'number')) return [option.id];
    return [];
  });
}

export function picsartParamRange(model: PicsartModel, name: string) {
  const key = findPicsartParam(model, name);
  if (!key) return null;
  const descriptor = model.params[key];
  if (typeof descriptor.min !== 'number' || typeof descriptor.max !== 'number') return null;
  return {
    min: descriptor.min,
    max: descriptor.max,
    step: typeof descriptor.step === 'number' && descriptor.step > 0 ? descriptor.step : 1,
  };
}

export function buildPicsartParams(model: PicsartModel, values: Record<string, unknown>) {
  const params: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    const key = findPicsartParam(model, name);
    if (key) params[key] = value;
  }
  if (!findPicsartParam(model, 'prompt')) {
    throw new HttpError(400, 'This model does not expose a prompt parameter and cannot be used in this studio', 'picsart_prompt_unsupported');
  }
  return params;
}

export function imagePickerParameters(model: PicsartModel) {
  const values: Array<[string, string]> = [
    ['negativePrompt', 'negative_prompt'],
    ['imageUrls', 'image_urls'],
    ['aspectRatio', 'aspect_ratio'],
    ['resolution', 'resolution'],
    ['quality', 'quality'],
    ['outputFormat', 'output_format'],
    ['count', 'n'],
  ];
  return values.filter(([key]) => hasPicsartParam(model, key)).map(([, alias]) => alias);
}

export function videoPickerModel(model: PicsartModel) {
  const durationOptions = picsartParamOptions(model, 'duration')
    .map((value) => typeof value === 'number' ? value : Number(value))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 120);
  const durationRange = picsartParamRange(model, 'duration');
  if (durationRange) {
    for (let value = Math.max(1, Math.ceil(durationRange.min)); value <= Math.min(120, durationRange.max); value += Math.max(1, Math.ceil(durationRange.step))) {
      durationOptions.push(value);
    }
  }
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    supportedAspectRatios: picsartParamOptions(model, 'aspectRatio').map(String),
    supportedDurations: [...new Set(durationOptions)].sort((a, b) => a - b),
    supportedResolutions: picsartParamOptions(model, 'resolution').map(String),
    supportedFrameImages: hasPicsartParam(model, 'startFrame') || hasPicsartParam(model, 'imageUrls') ? ['first_frame'] : [],
    generateAudio: hasPicsartParam(model, 'generateAudio'),
    price: null as number | null,
  };
}

export function extractPicsartResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object') return { status: '', result: null, id: null, usage: null as Record<string, unknown> | null, error: '' };
  const root = payload as Record<string, unknown>;
  const nested = root.response && typeof root.response === 'object' ? root.response as Record<string, unknown> : root;
  return {
    status: String(nested.status ?? ''),
    result: nested.result ?? null,
    id: typeof nested.id === 'string' ? nested.id : null,
    usage: nested.usage && typeof nested.usage === 'object' ? nested.usage as Record<string, unknown> : null,
    error: String(nested.error ?? nested.message ?? root.message ?? ''),
  };
}

async function parseWorkflowResponse(response: Response, context: string) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const nested = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).response : null;
    const message = nested && typeof nested === 'object'
      ? String((nested as Record<string, unknown>).message ?? (nested as Record<string, unknown>).error ?? '')
      : String((payload as Record<string, unknown> | null)?.message ?? '');
    throw new HttpError(response.status >= 500 ? 503 : 502, message.slice(0, 400) || context + ' failed (' + response.status + ')', 'picsart_workflow_error');
  }
  const responseData = extractPicsartResponse(payload);
  const success = payload && typeof payload === 'object' && (payload as Record<string, unknown>).status;
  if (success && success !== 'success') throw new HttpError(502, context + ' returned an unsuccessful API status', 'picsart_workflow_error');
  return responseData;
}

export async function picsartSubmitModel(userId: string, model: PicsartModel, params: Record<string, unknown>) {
  const response = await picsartFetch({
    userId,
    path: '/gw-v2/workflows/v1/models/submit',
    method: 'POST',
    body: { model: model.id, params },
    timeoutMs: 45_000,
  });
  const parsed = await parseWorkflowResponse(response, 'Picsart model submission');
  if (!parsed.id) throw new HttpError(502, 'Picsart did not return a generation job ID', 'picsart_missing_job_id');
  return parsed.id;
}

export async function picsartExecuteModel(userId: string, model: PicsartModel, params: Record<string, unknown>) {
  const response = await picsartFetch({
    userId,
    path: '/gw-v2/workflows/v1/models/execute',
    method: 'POST',
    body: { model: model.id, params },
    timeoutMs: 240_000,
  });
  const parsed = await parseWorkflowResponse(response, 'Picsart image generation');
  if (parsed.status && parsed.status !== 'COMPLETED') {
    if (parsed.status === 'FAILED') throw new HttpError(502, parsed.error || 'Picsart image generation failed', 'picsart_generation_failed');
    throw new HttpError(502, 'Picsart image generation did not complete synchronously', 'picsart_generation_incomplete');
  }
  return parsed;
}

export async function picsartPollModel(userId: string, jobId: string, timeoutMs = 45_000) {
  const response = await picsartFetch({
    userId,
    path: '/gw-v2/workflows/v1/models/' + encodeURIComponent(jobId) + '/result',
    method: 'GET',
    timeoutMs,
  });
  return parseWorkflowResponse(response, 'Picsart generation status check');
}

export async function transferPicsartAsset(
  userId: string,
  sourceUrl: string,
  maxBytes: number,
  kind: 'image' | 'video',
): Promise<{ storageKey: string; mime: string; sizeBytes: number }> {
  const formats = kind === 'image'
    ? [{ mime: 'image/png', ext: 'png' }, { mime: 'image/jpeg', ext: 'jpg' }, { mime: 'image/webp', ext: 'webp' }, { mime: 'image/avif', ext: 'avif' }]
    : [{ mime: 'video/mp4', ext: 'mp4' }, { mime: 'video/webm', ext: 'webm' }];
  const targets = Object.fromEntries(await Promise.all(formats.map(async (format) => {
    const key = `generated/${userId}/${kind}/${randomUUID()}.${format.ext}`;
    const url = await signedGeneratedUploadUrl(key, format.mime, 300);
    return [format.mime, { key, url }];
  })));
  const cleanup = async () => {
    await Promise.all(Object.values(targets).map((target) => deleteObject(target.key).catch(() => undefined)));
  };

  let response: Response;
  try {
    response = await aiRouterFetch({
      userId,
      path: '/media/picsart-transfer',
      body: { sourceUrl, kind, maxBytes, targets },
      signal: AbortSignal.timeout(kind === 'video' ? 240_000 : 90_000),
    });
  } catch (error) {
    await cleanup();
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'Cloudflare could not transfer the generated file to Backblaze', 'media_transfer_unavailable');
  }

  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    await cleanup();
    const message = typeof data.error === 'string' ? data.error : 'Generated media transfer failed';
    throw new HttpError(response.status >= 500 ? 502 : response.status, message.slice(0, 400), typeof data.code === 'string' ? data.code : 'media_transfer_failed');
  }

  const mime = typeof data.mime === 'string' ? data.mime : '';
  const target = targets[mime] as { key: string } | undefined;
  const sizeBytes = Number(data.sizeBytes);
  if (data.ok !== true || !target || data.storageKey !== target.key || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    await cleanup();
    throw new HttpError(502, 'Cloudflare returned invalid generated media transfer metadata', 'media_transfer_invalid_response');
  }
  await Promise.all(Object.values(targets).filter((candidate) => candidate.key !== target.key).map((candidate) =>
    deleteObject(candidate.key).catch(() => undefined)));
  return { storageKey: target.key, mime, sizeBytes };
}

export async function downloadPicsartAsset(url: string, maxBytes: number) {
  let current: URL;
  try { current = new URL(url); } catch { throw new HttpError(502, 'Picsart returned an invalid asset URL', 'picsart_invalid_asset_url'); }
  const assertTrusted = (candidate: URL) => {
    if (candidate.protocol !== 'https:' || !(candidate.hostname === 'picsart.com' || candidate.hostname.endsWith('.picsart.com'))) {
      throw new HttpError(502, 'Picsart returned an asset URL outside its trusted CDN', 'picsart_untrusted_asset_url');
    }
  };
  assertTrusted(current);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(90_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new HttpError(502, 'Picsart asset redirect could not be followed safely', 'picsart_asset_redirect');
      current = new URL(location, current);
      assertTrusted(current);
      continue;
    }
    if (!response.ok) throw new HttpError(502, 'Could not download the generated asset from Picsart', 'picsart_asset_download_failed');
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new HttpError(413, 'Generated asset exceeds the storage limit', 'picsart_asset_too_large');
    if (!response.body) throw new HttpError(502, 'Picsart returned an empty asset', 'picsart_empty_asset');
    const chunks: Buffer[] = [];
    const reader = response.body.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new HttpError(413, 'Generated asset exceeds the storage limit', 'picsart_asset_too_large');
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, total);
    if (!bytes.length) throw new HttpError(502, 'Picsart returned an empty asset', 'picsart_empty_asset');
    return {
      bytes,
      mime: (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].toLowerCase(),
    };
  }
  throw new HttpError(502, 'Picsart asset redirect limit was reached', 'picsart_asset_redirect');
}
