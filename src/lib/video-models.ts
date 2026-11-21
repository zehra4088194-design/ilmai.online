import 'server-only';
import { z } from 'zod';
import { aiRouterFetch } from '@/lib/ai-router';
import { HttpError } from '@/lib/http';

const VideoModelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().optional(),
  description: z.string().optional(),
  supported_aspect_ratios: z.array(z.string()).default([]),
  supported_durations: z.array(z.number().int().positive()).default([]),
  supported_resolutions: z.array(z.string()).default([]),
  supported_sizes: z.array(z.string()).nullable().optional(),
  supported_frame_images: z.array(z.enum(['first_frame','last_frame'])).default([]),
  generate_audio: z.boolean().default(false),
  allowed_passthrough_parameters: z.array(z.string()).default([]),
  pricing_skus: z.record(z.string(), z.unknown()).default({}),
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
  const parsed = VideoCatalogSchema.safeParse(await response.json());
  if (!parsed.success) throw new HttpError(502, 'Video model catalogue returned an invalid response', 'invalid_video_catalog');
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
