import 'server-only';
import { createHmac, randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';

export type RouterProvider = 'openrouter' | 'groq' | 'gemini' | 'auto';
export type RouterCandidate = {
  id: string;
  provider?: Exclude<RouterProvider,'auto'>;
  priority?: number;
  modalities?: string[];
  task?: string;
};

export async function aiRouterFetch(input: {
  userId: string;
  path: string;
  method?: 'GET'|'POST'|'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}) {
  if (!env.aiRouterUrl || !env.aiRouterSecret)
    throw new HttpError(503, 'Cloudflare AI Router is not configured on this deployment', 'ai_router_not_configured');
  const method = input.method ?? 'POST';
  const target = new URL(input.path, env.aiRouterUrl);
  const signedPath = target.pathname + target.search;
  const bodyText = method === 'GET' || input.body === undefined ? '' : JSON.stringify(input.body);
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = createHmac('sha256', env.aiRouterSecret)
    .update([timestamp, nonce, method, signedPath, bodyText].join('.'))
    .digest('hex');
  try {
    return await fetch(target, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-ilm-timestamp': timestamp,
        'x-ilm-nonce': nonce,
        'x-ilm-signature': signature,
        'x-ilm-user-id': input.userId,
        'x-ilm-request-id': randomUUID(),
      },
      body: bodyText || undefined,
      signal: input.signal ?? AbortSignal.timeout(240000),
      cache: 'no-store',
    });
  } catch (error) {
    if (input.signal?.aborted) throw error;
    throw new HttpError(503, 'Cloudflare AI Router could not be reached', 'ai_router_unavailable');
  }
}

export async function aiRouterChat(input: {
  userId: string;
  model: string;
  messages: unknown[];
  max_tokens?: number;
  temperature?: number;
  response_format?: Record<string, unknown>;
  routing?: { provider: RouterProvider; candidates?: RouterCandidate[]; hints?: string };
  timeoutMs?: number;
}) {
  const response = await aiRouterFetch({
    userId: input.userId,
    path: '/v1/chat/completions',
    body: {
      model: input.model,
      messages: input.messages,
      max_tokens: input.max_tokens,
      temperature: input.temperature,
      response_format: input.response_format,
      stream: false,
      usage: { include: true },
      routing: input.routing ?? { provider: 'openrouter' },
    },
    signal: AbortSignal.timeout(input.timeoutMs ?? 120000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, body?.error?.message ?? body?.error ?? 'AI provider error', 'ai_provider_error');
  return { ...body, routedModel: response.headers.get('x-ilm-model') ?? input.model, provider: response.headers.get('x-ilm-provider') ?? 'openrouter' } as {
    choices: { message: { content: string | null; images?: { image_url: { url: string } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    routedModel: string;
    provider: string;
  };
}
