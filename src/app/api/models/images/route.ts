import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getImageModels, supports } from '@/lib/image-models';
import { imagePickerParameters, picsartParamOptions, picsartParamRange } from '@/lib/picsart-models';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('image_generation', profile.plan, isAdmin);
  const config = feature.config ?? {};
  const disabled = Array.isArray(config.disabled_models) ? config.disabled_models.filter((id): id is string => typeof id === 'string') : [];
  const legacyAllowed = Array.isArray(config.allowed_models) ? config.allowed_models.filter((id): id is string => typeof id === 'string') : [];
  const allModels = await getImageModels(profile.id);
  const models = allModels.filter((model) =>
    !disabled.includes(model.id) && (!legacyAllowed.length || legacyAllowed.includes(model.id)),
  );
  const configuredDefault = typeof config.default_model === 'string' ? config.default_model : null;
  if (configuredDefault) models.sort((a, b) => Number(b.id === configuredDefault) - Number(a.id === configuredDefault));
  return json({
    models: models.map((model) => ({
      id: model.id, name: model.name, description: model.description,
      parameters: imagePickerParameters(model),
      parameterOptions: {
        aspect_ratio: picsartParamOptions(model, 'aspectRatio').map(String),
        resolution: picsartParamOptions(model, 'resolution').map(String),
        quality: picsartParamOptions(model, 'quality').map(String),
        output_format: picsartParamOptions(model, 'outputFormat').map(String),
        n: (() => {
          const options = picsartParamOptions(model, 'count').map(String);
          const range = picsartParamRange(model, 'count');
          if (options.length || !range) return options;
          const values: string[] = [];
          for (let value = Math.max(1, Math.ceil(range.min)); value <= Math.min(10, range.max); value += Math.max(1, Math.ceil(range.step))) values.push(String(value));
          return values;
        })(),
      },
      parameterRanges: {
        n: picsartParamRange(model, 'count'),
      },
      inputModalities: supports(model, 'imageUrls') ? ['image'] : ['text'],
      provider: model.provider.name,
    })),
    defaultModel: configuredDefault && models.some((model) => model.id === configuredDefault) ? configuredDefault : null,
  }, { headers: { 'Cache-Control': 'private, max-age=60' } });
});
