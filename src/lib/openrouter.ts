import 'server-only';
import { unstable_cache } from 'next/cache';
import { aiRouterFetch } from '@/lib/ai-router';

export type OrModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  created?: number;
  pricing?: { prompt?: string; completion?: string; image?: string; request?: string; input_cache_read?: string; input_cache_write?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string };
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | unknown[] };

/**
 * Catalogue-only OpenRouter access. All chat, image and video inference must go
 * through the signed Cloudflare AI Router (src/lib/ai-router.ts).
 */
const fetchOrModelsCached = unstable_cache(
  async (): Promise<OrModel[]> => {
    const res = await aiRouterFetch({
      userId: 'model-catalog',
      path: '/openrouter/models',
      method: 'GET',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`OpenRouter /models via Cloudflare Worker failed: ${res.status}`);
    const j = (await res.json()) as { data: OrModel[] };
    return j.data ?? [];
  },
  ['openrouter-model-catalog-via-cloudflare'],
  { revalidate: 3600, tags: ['or-models'] },
);

export async function fetchOrModels(): Promise<OrModel[]> {
  return fetchOrModelsCached();
}
