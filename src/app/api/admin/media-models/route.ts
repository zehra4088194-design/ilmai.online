import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { getPicsartModels, type PicsartMode } from '@/lib/picsart-models';

export const dynamic = 'force-dynamic';

const ModeSchema = z.enum(['image','video']);
const PatchBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set-enabled'),
    mode: ModeSchema,
    modelId: z.string().min(1).max(200),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal('set-default'),
    mode: ModeSchema,
    modelId: z.string().min(1).max(200),
  }),
]);

const FEATURE_KEY: Record<PicsartMode, string> = {
  image: 'image_generation',
  video: 'video_generation',
};

async function readConfigs() {
  const { data, error } = await adminClient().from('feature_flags')
    .select('key,config').in('key',['image_generation','video_generation']);
  if (error) throw error;
  return new Map((data ?? []).map((item) => [item.key, (item.config ?? {}) as Record<string, unknown>]));
}

export const GET = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const force = req.nextUrl.searchParams.get('refresh') === '1';
  const [imageModels, videoModels, configs] = await Promise.all([
    getPicsartModels('image','admin-media-catalog',force),
    getPicsartModels('video','admin-media-catalog',force),
    readConfigs(),
  ]);

  function shape(mode: PicsartMode, models: typeof imageModels) {
    const config = configs.get(FEATURE_KEY[mode]) ?? {};
    const disabled = new Set(Array.isArray(config.disabled_models)
      ? config.disabled_models.filter((id): id is string => typeof id === 'string') : []);
    const legacyAllowed = Array.isArray(config.allowed_models)
      ? config.allowed_models.filter((id): id is string => typeof id === 'string') : [];
    const defaultModel = typeof config.default_model === 'string' ? config.default_model : null;
    return models.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      provider: model.provider.name,
      release: model.release ?? '',
      features: model.features.map((feature) => feature.label),
      enabled: !disabled.has(model.id) && (!legacyAllowed.length || legacyAllowed.includes(model.id)),
      isDefault: model.id === defaultModel && !disabled.has(model.id) && (!legacyAllowed.length || legacyAllowed.includes(model.id)),
    }));
  }

  return json({
    image: shape('image', imageModels),
    video: shape('video', videoModels),
    refreshedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PATCH = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const body = PatchBody.parse(await req.json());
  const mode = body.mode;
  const models = await getPicsartModels(mode,'admin-media-admin');
  if (!models.some((model) => model.id === body.modelId)) {
    throw new HttpError(404, 'That model is not present in the current Picsart catalogue. Refresh the catalogue before enabling it.', 'picsart_model_not_found');
  }

  const key = FEATURE_KEY[mode];
  const { data: row, error: readError } = await adminClient().from('feature_flags')
    .select('config').eq('key',key).single();
  if (readError) throw readError;
  const config = { ...((row?.config ?? {}) as Record<string, unknown>) };
  const disabled = new Set(Array.isArray(config.disabled_models)
    ? config.disabled_models.filter((id): id is string => typeof id === 'string') : []);

  const legacyAllowed = Array.isArray(config.allowed_models)
    ? config.allowed_models.filter((id): id is string => typeof id === 'string') : [];
  if (body.action === 'set-enabled') {
    if (body.enabled) disabled.delete(body.modelId);
    else disabled.add(body.modelId);
    if (legacyAllowed.length) {
      config.allowed_models = body.enabled
        ? [...new Set([...legacyAllowed, body.modelId])]
        : legacyAllowed.filter((id) => id !== body.modelId);
    }
    const enabledCount = models.filter((model) => !disabled.has(model.id)).length;
    if (enabledCount < 1) throw new HttpError(400, 'At least one ' + mode + ' model must remain enabled', 'media_model_required');
    config.disabled_models = [...disabled];
    if (!body.enabled && config.default_model === body.modelId) config.default_model = null;
  } else {
    if (disabled.has(body.modelId)) disabled.delete(body.modelId);
    if (legacyAllowed.length && !legacyAllowed.includes(body.modelId)) config.allowed_models = [...legacyAllowed, body.modelId];
    config.disabled_models = [...disabled];
    config.default_model = body.modelId;
  }

  const { error } = await adminClient().from('feature_flags')
    .update({ config, updated_at: new Date().toISOString() }).eq('key',key);
  if (error) throw error;
  revalidateTag('flags');
  return json({
    ok: true,
    mode,
    modelId: body.modelId,
    enabled: !disabled.has(body.modelId),
    isDefault: config.default_model === body.modelId,
  });
});
