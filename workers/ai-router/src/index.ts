import type { Env, ModelCandidate, Provider } from './env';
import { verifyRequest } from './security';
import { callChatProvider, fetchOpenRouter, routeAuto } from './providers';

export { RequestGate, KeyPool } from './durable-objects';
const MAX_BODY = 4 * 1024 * 1024;
function errorResponse(status: number, error: string, code: string) {
  return Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function authenticate(request: Request, env: Env, rawBody: string) {
  const timestamp = request.headers.get('x-ilm-timestamp') ?? '';
  const nonce = request.headers.get('x-ilm-nonce') ?? '';
  const signature = request.headers.get('x-ilm-signature') ?? '';
  const userId = request.headers.get('x-ilm-user-id') ?? '';
  const requestId = request.headers.get('x-ilm-request-id') ?? '';
  if (!userId || userId.length > 100 || !requestId || requestId.length > 100)
    return { ok: false as const, response: errorResponse(401, 'Missing signed request identity', 'unauthorized') };
  const valid = await verifyRequest({
    secret: env.AI_ROUTER_SECRET, timestamp, nonce, method: request.method,
    pathname: new URL(request.url).pathname + new URL(request.url).search, body: rawBody, signature,
  });
  if (!valid) return { ok: false as const, response: errorResponse(401, 'Invalid or expired signature', 'invalid_signature') };
  const gate = env.REQUEST_GATES.get(env.REQUEST_GATES.idFromName(userId));
  const gated = await gate.fetch('https://request-gate.internal/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp: Number(timestamp), nonce, userLimit: Number(env.USER_REQUESTS_PER_MINUTE || 30) }),
  });
  if (!gated.ok) return { ok: false as const, response: new Response(await gated.text(), { status: gated.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) };
  return { ok: true as const, userId, requestId };
}
async function handleChat(request: Request, env: Env, bodyText: string) {
  let input: Record<string, unknown>;
  try { input = JSON.parse(bodyText); } catch { return errorResponse(400, 'Invalid JSON body', 'invalid_json'); }
  const routing = (input.routing ?? {}) as { provider?: Provider|'auto'; model?: string; candidates?: ModelCandidate[]; hints?: string };
  delete input.routing;
  const modelId = typeof input.model === 'string' ? input.model : routing.model;
  const candidates = Array.isArray(routing.candidates)
    ? routing.candidates.filter((item) => item && typeof item.id === 'string' && item.id.length <= 200 &&
      ['openrouter','groq','gemini'].includes(item.provider ?? 'openrouter')).slice(0, 30)
    : [];
  let chosen: ModelCandidate | undefined;
  if (routing.provider === 'auto') {
    if (!candidates.length) return errorResponse(400, 'Auto routing requires server-approved candidate models', 'no_auto_candidates');
    try { chosen = await routeAuto(env, candidates, Array.isArray(input.messages) ? input.messages : [], String(routing.hints ?? '')); }
    catch { chosen = candidates.slice().sort((a,b) => (a.priority ?? 100) - (b.priority ?? 100))[0]; }
  } else {
    chosen = { id: modelId ?? '', provider: routing.provider ?? 'openrouter' };
    if (candidates.length && !candidates.some((item) => item.id === chosen?.id && (item.provider ?? 'openrouter') === chosen?.provider))
      return errorResponse(400, 'The requested model is not in the server-approved candidate list', 'model_not_allowed');
  }
  if (!chosen?.id || chosen.id.length > 200) return errorResponse(400, 'A valid model is required', 'invalid_model');

  const payload = { ...input, model: chosen.id };
  let routed = await callChatProvider(env, chosen, payload, request.signal);
  if (!routed.response.ok && candidates.length) {
    const fallbacks = candidates.filter((item) => item.id !== chosen!.id).sort((a,b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const fallback of fallbacks.slice(0, 3)) {
      routed = await callChatProvider(env, fallback, payload, request.signal);
      if (routed.response.ok) { chosen = fallback; break; }
    }
  }
  const headers = new Headers(routed.response.headers);
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('X-Accel-Buffering', 'no');
  headers.set('x-ilm-model', chosen.id);
  headers.set('x-ilm-provider', chosen.provider ?? 'openrouter');
  headers.set('x-ilm-router-attempts', String(routed.attempts));
  return new Response(routed.response.body, { status: routed.response.status, headers });
}
async function proxyOpenRouter(request: Request, env: Env, path: string, bodyText: string) {
  const response = await fetchOpenRouter(env, path, {
    method: request.method,
    headers: { 'Content-Type': request.headers.get('content-type') ?? 'application/json' },
    body: request.method === 'GET' ? undefined : bodyText,
    signal: request.signal,
  });
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Accel-Buffering', 'no');
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health')
      return Response.json({ ok: true, service: 'ilmai-ai-router', version: '1' });
    const bodyText = request.method === 'GET' ? '' : await request.text();
    if (bodyText.length > MAX_BODY) return errorResponse(413, 'Request body is too large', 'payload_too_large');
    const auth = await authenticate(request, env, bodyText);
    if (!auth.ok) return auth.response;
    if (request.method === 'GET' && url.pathname === '/providers/health') {
      const keyStates = await Promise.all(['groq','gemini'].map(async (provider) => {
        const stub = env.KEY_POOLS.get(env.KEY_POOLS.idFromName(provider));
        const response = await stub.fetch('https://key-pool.internal/', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'health', provider }),
        });
        return response.json();
      }));
      return Response.json({ providers: keyStates, openrouterConfigured: !!env.OPENROUTER_API_KEY }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') return handleChat(request, env, bodyText);
    if (url.pathname.startsWith('/v1/images') || url.pathname.startsWith('/v1/videos'))
      return proxyOpenRouter(request, env, url.pathname.replace(/^\/v1/, '') + url.search, bodyText);
    return errorResponse(404, 'Route not found', 'not_found');
  },
};
