import 'server-only';
import { z } from 'zod';
import { aiRouterFetch } from '@/lib/ai-router';
import { HttpError } from '@/lib/http';

// OpenRouter's video catalogue can return null for optional capability fields.
// Normalize those fields so one model with an omitted capability never breaks the whole picker.
const stringList = z.array(z.string()).nullish().transform((values) =>
  (values ?? []).filter((value) => value.trim().length > 0),
);
const durationList = z.array(z.number().int().positive()).nullish().transform((values) =>
  [...new Set(values ?? [])].sort((a, b) => a - b),
);

const VideoModelSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().nullish(),
  description: z.string().nullish(),
  supported_aspect_ratios: stringList,
  supported_durations: durationList,
  supported_resolutions: stringList,
  supported_sizes: stringList,
  // Some catalog entries omit frame-image support and return null rather than [].
  // Ignore future/unknown roles instead of rejecting every video model in the response.
  supported_frame_images: stringList.transform((values) =>
    values.filter((value): value is 'first_frame' | 'last_frame' =>
      value === 'first_frame' || value === 'last_frame',
    ),
  ),
  generate_audio: z.boolean().nullish().transform((value) => value ?? false),
  allowed_passthrough_parameters: stringList,
  pricing_skus: z.record(z.string(), z.unknown()).nullish().transform((value) => value ?? {}),
}).passthrough();

const VideoCatalogSchema = z.object({ data: z.array(VideoModelSchema) });
export type VideoModel = z.infer<typeof VideoModelSchema>;

let cached: { expiresAt: number; data: VideoModel[] } | null = null;

export async function getVideoModels(force = false): Promise<VideoModel[]> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;
  const response = await aiRouterFetch({ userId: 'catalog', path: '/v1/videos/models', method: 'GET' });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new HttpError(response.status >= 500 ? 503 : response.status, detail.slice(0,300) || 'Could not load video model catalogue', 'video_catalog_unavailable');
  }
  const payload = await response.json().catch(() => null);
  const parsed = VideoCatalogSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('[video-catalog] OpenRouter returned an unsupported catalogue shape:', parsed.error.issues.slice(0, 8));
    throw new HttpError(502, 'Video model catalogue returned an invalid response', 'invalid_video_catalog');
  }
  cached = { expiresAt: Date.now() + 5 * 60 * 1000, data: parsed.data.data };
  return cached.data;
}

export function videoModelPrice(model: VideoModel) {
  const value = model.pricing_skus.generate;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const price = Number(value.replace(/^\$/, ''));
    return Number.isFinite(price) && price >= 0 ? price : Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}
