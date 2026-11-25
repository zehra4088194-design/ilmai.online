import type { Env, ModelCandidate, Provider } from './env';

export type KeyLease = { provider: 'groq'|'gemini'; slot: number; key: string };
export type RoutedResponse = { response: Response; model: string; provider: Provider; attempts: number };

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

async function keyRequest(env: Env, provider: 'groq'|'gemini', action: string, extra: Record<string, unknown> = {}) {
  const stub = env.KEY_POOLS.get(env.KEY_POOLS.idFromName(provider));
  const response = await stub.fetch('https://key-pool.internal/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, provider, ...extra }),
  });
  return { response, data: await response.json().catch(() => ({})) as Record<string, unknown> };
}
async function lease(env: Env, provider: 'groq'|'gemini'): Promise<KeyLease | null> {
  const result = await keyRequest(env, provider, 'acquire');
  if (!result.response.ok) return null;
  return { provider, slot: Number(result.data.slot), key: String(result.data.key ?? '') };
}
async function report(env: Env, key: KeyLease, status: number) {
  await keyRequest(env, key.provider, 'report', { slot: key.slot, status }).catch(() => undefined);
}
function providerUrl(provider: Provider) {
  if (provider === 'groq') return GROQ_BASE + '/chat/completions';
  if (provider === 'gemini') return GEMINI_BASE + '/chat/completions';
  return OPENROUTER_BASE + '/chat/completions';
}

export async function callChatProvider(env: Env, candidate: ModelCandidate, payload: Record<string, unknown>, signal?: AbortSignal, timeoutMs = Number(env.PROVIDER_TIMEOUT_MS || 30_000)): Promise<RoutedResponse> {
  const provider: Provider = candidate.provider ?? 'openrouter';
  if (provider === 'openrouter') {
    if (!env.OPENROUTER_API_KEY) return { response: Response.json({ error: 'OpenRouter is not configured' }, { status: 503 }), model: candidate.id, provider, attempts: 0 };
    const response = await fetch(providerUrl(provider), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://ilmai.online', 'X-Title': 'Ilm AI' },
      body: JSON.stringify({ ...payload, model: candidate.id }), signal,
    }).catch((error) => new Response(JSON.stringify({ error: String(error) }), { status: 502, headers: { 'Content-Type': 'application/json' } }));
    return { response, model: candidate.id, provider, attempts: 1 };
  }
  let attempts = 0;
  let last = new Response('Provider keys are not configured', { status: 503 });
  const attemptedSlots = new Set<number>();
  while (attempts < 10) {
    const current = await lease(env, provider);
    if (!current || attemptedSlots.has(current.slot)) return { response: last, model: candidate.id, provider, attempts };
    attemptedSlots.add(current.slot);
    attempts++;
    const response = await fetch(providerUrl(provider), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + current.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, model: candidate.id }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    }).catch((error) => new Response(JSON.stringify({ error: String(error) }), { status: 502, headers: { 'Content-Type': 'application/json' } }));
    if (signal?.aborted) return { response, model: candidate.id, provider, attempts };
    await report(env, current, response.status);
    if (response.ok) return { response, model: candidate.id, provider, attempts };
    last = response;
  }
  return { response: last, model: candidate.id, provider, attempts };
}

/** Deterministic Auto selection: Groq is reserved for the three approved helper tasks. */
export async function routeAuto(_env: Env, candidates: ModelCandidate[], _messages: unknown[], hints: string) {
  if (!candidates.length) throw new Error('No model candidates are available for Auto routing');
  const sorted = [...candidates].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const hint = hints.toLowerCase();
  const required = hint.includes('image') || hint.includes('vision') ? 'vision'
    : hint.includes('pdf') || hint.includes('document') ? 'document' : undefined;
  const capable = required ? sorted.filter((item) => item.modalities?.includes(required)) : sorted;
  return (capable.length ? capable : sorted)[0];
}
export async function fetchOpenRouter(env: Env, path: string, init: RequestInit = {}) {
  if (!env.OPENROUTER_API_KEY) return new Response('OpenRouter is not configured', { status: 503 });
  return fetch(OPENROUTER_BASE + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'HTTP-Referer': 'https://ilmai.online', 'X-Title': 'Ilm AI', ...(init.headers ?? {}) },
  });
}
