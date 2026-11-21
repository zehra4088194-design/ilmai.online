import 'server-only';
import { env } from '@/lib/env';

export const OR_BASE = 'https://openrouter.ai/api/v1';

const headers = () => ({
  Authorization: `Bearer ${env.openrouterKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': env.siteUrl,
  'X-Title': 'Ilm AI',
});

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
  if (!env.openrouterKey) throw new Error('OPENROUTER_API_KEY is not configured for model catalogue discovery');
  const res = await fetch(`${OR_BASE}/models`, { headers: headers(), next: { revalidate: 3600, tags: ['or-models'] } });
  if (!res.ok) throw new Error(`OpenRouter /models failed: ${res.status}`);
  const j = (await res.json()) as { data: OrModel[] };
  return j.data ?? [];
}
