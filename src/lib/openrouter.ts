import 'server-only';
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
export async function fetchOrModels(): Promise<OrModel[]> {
  const res = await aiRouterFetch({
    userId: 'model-catalog',
    path: '/openrouter/models',
    method: 'GET',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`OpenRouter /models failed: ${res.status}`);
  const j = (await res.json()) as { data: OrModel[] };
  return j.data ?? [];
}
