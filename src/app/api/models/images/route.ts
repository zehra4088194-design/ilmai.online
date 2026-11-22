import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getImageModels } from '@/lib/image-models';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('image_generation', profile.plan, isAdmin);
  const models = await getImageModels(profile.id);
  return json({
    models: models.map((model) => ({
      id: model.id, name: model.name ?? model.id, description: model.description ?? '',
      parameters: model.supported_parameters,
      inputModalities: model.architecture?.input_modalities ?? ['text'],
    })),
  }, { headers: { 'Cache-Control': 'private, max-age=300' } });
});
