import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getVideoModels } from '@/lib/video-models';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('video_generation', profile.plan, isAdmin);
  const config = feature.config ?? {};
  const disabled = Array.isArray(config.disabled_models) ? config.disabled_models.filter((id): id is string => typeof id === 'string') : [];
  const legacyAllowed = Array.isArray(config.allowed_models) ? config.allowed_models.filter((id): id is string => typeof id === 'string') : [];
  const allModels = await getVideoModels(false, profile.id);
  const models = allModels.filter((model) =>
    !disabled.includes(model.id) && (!legacyAllowed.length || legacyAllowed.includes(model.id)),
  );
  const configuredDefault = typeof config.default_model === 'string' ? config.default_model : null;
  if (configuredDefault) models.sort((a, b) => Number(b.id === configuredDefault) - Number(a.id === configuredDefault));
  return json({
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      supportedAspectRatios: model.supportedAspectRatios,
      supportedDurations: model.supportedDurations,
      supportedResolutions: model.supportedResolutions,
      supportedFrameImages: model.supportedFrameImages,
      generateAudio: model.generateAudio,
      price: null,
      provider: model.provider.name,
    })),
    defaultModel: configuredDefault && models.some((model) => model.id === configuredDefault) ? configuredDefault : null,
    creditsPerSecond: Number(config.credits_per_second ?? 0),
    maxDuration: Number(config.max_duration_seconds ?? 30),
    maxReferenceMb: Number(config.max_reference_mb ?? 12),
  }, { headers: { 'Cache-Control': 'private, max-age=60' } });
});
