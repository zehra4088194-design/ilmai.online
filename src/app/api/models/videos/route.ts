import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getVideoModels } from '@/lib/video-models';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('video_generation', profile.plan, isAdmin);
  const models = await getVideoModels();
  const config = feature.config ?? {};
  const allowed = Array.isArray(config.allowed_models)
    ? config.allowed_models.filter((value): value is string => typeof value === 'string')
    : [];
  const enabledModels = models.filter((model) => !allowed.length || allowed.includes(model.id));
  const configuredDefault = typeof config.default_model === 'string' ? config.default_model : null;
  return json({
    models: enabledModels.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      description: model.description ?? '',
      supportedAspectRatios: model.supported_aspect_ratios,
      supportedDurations: model.supported_durations,
      supportedResolutions: model.supported_resolutions,
      supportedFrameImages: model.supported_frame_images,
      generateAudio: model.generate_audio,
      price: videoModelPriceSafe(model),
    })),
    defaultModel: configuredDefault,
    creditsPerSecond: Number(config.credits_per_second ?? 0),
    maxDuration: Number(config.max_duration_seconds ?? 30),
    maxReferenceMb: Number(config.max_reference_mb ?? 12),
  }, { headers: { 'Cache-Control': 'private, max-age=300' } });
});

function videoModelPriceSafe(model: { pricing_skus: Record<string, unknown> }) {
  const value = model.pricing_skus.generate;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/^\$/, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
