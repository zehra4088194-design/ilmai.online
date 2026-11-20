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
  pricing?: { prompt?: string; completion?: string; image?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string };
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | unknown[] };

/** Full public model catalogue (cached 1h). */
export async function fetchOrModels(): Promise<OrModel[]> {
  const res = await fetch(`${OR_BASE}/models`, { headers: headers(), next: { revalidate: 3600, tags: ['or-models'] } });
  if (!res.ok) throw new Error(`OpenRouter /models failed: ${res.status}`);
  const j = (await res.json()) as { data: OrModel[] };
  return j.data ?? [];
}

/** Streaming chat completion – returns the raw upstream Response (SSE). */
export async function orStream(body: Record<string, unknown>, signal?: AbortSignal) {
  return fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    signal,
    body: JSON.stringify({ ...body, stream: true, usage: { include: true } }),
  });
}

/** Non-streaming chat completion. */
export async function orChat(body: Record<string, unknown>, signal?: AbortSignal) {
  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    signal,
    body: JSON.stringify({ ...body, stream: false, usage: { include: true } }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message ?? `OpenRouter error ${res.status}`);
  return j as {
    choices: { message: { content: string | null; images?: { image_url: { url: string } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
}
