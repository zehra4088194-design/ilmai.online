import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';

const CapabilitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enum'), values: z.array(z.string()).default([]) }).passthrough(),
  z.object({ type: z.literal('range'), min: z.number(), max: z.number() }).passthrough(),
  z.object({ type: z.literal('boolean') }).passthrough(),
]);
const CatalogModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  architecture: z.object({
    input_modalities: z.array(z.string()).default(['text']),
    output_modalities: z.array(z.string()).default(['image']),
  }).passthrough().optional(),
  supported_parameters: z.record(z.string(), CapabilitySchema).default({}),
  endpoints: z.string().optional(),
}).passthrough();
const CatalogSchema = z.object({ data: z.array(CatalogModelSchema) });
const EndpointSchema = z.object({
  provider_slug: z.string().nullable().optional(),
  provider_tag: z.string().nullable().optional(),
  supported_parameters: z.record(z.string(), CapabilitySchema).default({}),
  pricing: z.array(z.object({
    billable: z.string(),
    unit: z.string(),
    cost_usd: z.number().nonnegative(),
    variant: z.string().optional(),
  }).passthrough()).default([]),
}).passthrough();
const EndpointListSchema = z.object({ id: z.string().optional(), endpoints: z.array(EndpointSchema) });

export type ImageCapability = z.infer<typeof CapabilitySchema>;
export type ImageModel = z.infer<typeof CatalogModelSchema>;
export type ImageEndpoint = z.infer<typeof EndpointSchema>;
export type ImageOutput = {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, ImageCapability>;
  inputModalities: string[];
  endpoint: ImageEndpoint | null;
  priceUsd: number | null;
};

async function openRouterFetch(path: string) {
  if (!env.openrouterKey) throw new HttpError(503, 'OpenRouter is not configured', 'provider_not_configured');
  const response = await fetch('https://openrouter.ai/api/v1' + path, {
    headers: {
      Authorization: 'Bearer ' + env.openrouterKey,
      'HTTP-Referer': env.siteUrl,
      'X-Title': 'Ilm AI',
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!response?.ok) {
    const detail = response ? await response.text().catch(() => '') : '';
    throw new HttpError(response?.status === 401 ? 503 : 502, detail.slice(0, 300) || 'Could not load image model catalog', 'image_catalog_unavailable');
  }
  return response.json();
}

let catalogCache: { expiresAt: number; models: ImageModel[] } | null = null;
export async function getImageModels(force = false): Promise<ImageModel[]> {
  if (!force && catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models;
  const parsed = CatalogSchema.safeParse(await openRouterFetch('/images/models'));
  if (!parsed.success) throw new HttpError(502, 'Image model catalog returned an invalid response', 'invalid_image_catalog');
  const models = parsed.data.data.filter((model) =>
    model.architecture?.output_modalities?.includes('image') !== false,
  );
  catalogCache = { expiresAt: Date.now() + 5 * 60 * 1000, models };
  return models;
}

export async function getImageModel(id: string): Promise<ImageOutput> {
  const models = await getImageModels();
  const model = models.find((item) => item.id === id);
  if (!model) throw new HttpError(400, 'The selected model is not available for image generation', 'image_model_unavailable');

  let endpoint: ImageEndpoint | null = null;
  let priceUsd: number | null = null;
  if (model.endpoints) {
    try {
      const url = model.endpoints.startsWith('/') ? model.endpoints : '/images/models/' + encodeURIComponent(model.id) + '/endpoints';
      const response = EndpointListSchema.safeParse(await openRouterFetch(url));
      if (response.success) {
        const choices = response.data.endpoints.map((item) => {
          const price = item.pricing.filter((p) => p.billable === 'output_image').reduce((sum,p) => sum + p.cost_usd,0);
          return { item, price };
        }).sort((a,b) => a.price - b.price);
        endpoint = choices[0]?.item ?? null;
        priceUsd = choices[0]?.price ?? null;
      }
    } catch { /* Catalog-level capabilities still allow a provider-routed request. */ }
  }
  return {
    id: model.id,
    name: model.name ?? model.id,
    description: model.description ?? '',
    parameters: endpoint?.supported_parameters && Object.keys(endpoint.supported_parameters).length
      ? endpoint.supported_parameters : model.supported_parameters,
    inputModalities: model.architecture?.input_modalities ?? ['text'],
    endpoint,
    priceUsd,
  };
}

export function supports(model: ImageOutput, parameter: string) {
  return Object.prototype.hasOwnProperty.call(model.parameters, parameter);
}

export function enumValues(model: ImageOutput, parameter: string) {
  const descriptor = model.parameters[parameter];
  return descriptor?.type === 'enum' ? descriptor.values : [];
}
