import 'server-only';

import { getPicsartModels, videoPickerModel, type PicsartModel } from '@/lib/picsart-models';

export type VideoModel = PicsartModel & ReturnType<typeof videoPickerModel>;

export async function getVideoModels(force = false, userId = 'model-catalog'): Promise<VideoModel[]> {
  const models = await getPicsartModels('video', userId, force);
  return models.map((model) => ({ ...model, ...videoPickerModel(model) }));
}

/** Picsart bills in provider credits; it does not expose an equivalent USD quote here. */
export function videoModelPrice(_model: VideoModel) {
  return Number.POSITIVE_INFINITY;
}
