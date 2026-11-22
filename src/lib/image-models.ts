import 'server-only';

import { getPicsartModels, getPicsartModel, hasPicsartParam, picsartParamOptions, type PicsartModel } from '@/lib/picsart-models';

export type ImageCapability = string | number;
export type ImageModel = PicsartModel;
export type ImageOutput = PicsartModel;

export async function getImageModels(userId = 'model-catalog', force = false): Promise<ImageModel[]> {
  return getPicsartModels('image', userId, force);
}

export async function getImageModel(id: string, userId = 'model-catalog'): Promise<ImageOutput> {
  return getPicsartModel('image', id, userId);
}

export function supports(model: ImageOutput, parameter: string) {
  const aliases: Record<string, string> = {
    aspect_ratio: 'aspectRatio',
    output_format: 'outputFormat',
    n: 'count',
  };
  return hasPicsartParam(model, aliases[parameter] ?? parameter);
}

export function enumValues(model: ImageOutput, parameter: string) {
  const aliases: Record<string, string> = {
    aspect_ratio: 'aspectRatio',
    output_format: 'outputFormat',
    n: 'count',
  };
  return picsartParamOptions(model, aliases[parameter] ?? parameter).map(String);
}
