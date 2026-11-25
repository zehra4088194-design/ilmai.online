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
  const routing = (input.routing ?? {}) as { provider?: Provider|'auto'; model?: string; candidates?: ModelCandidate[]; hints?: string; task?: string };
  delete input.routing;
  const modelId = typeof input.model === 'string' ? input.model : routing.model;
  const approvedGroqTasks = ['prompt-enhancement', 'conversation-title', 'comparison-summary'];
  if (routing.provider === 'groq' && !approvedGroqTasks.includes(String(routing.task ?? '')))
    return errorResponse(403, 'Groq is reserved for prompt enhancement, chat titles and comparison summaries', 'groq_task_not_allowed');
  const candidates = Array.isArray(routing.candidates)
    ? routing.candidates.filter((item) => item && typeof item.id === 'string' && item.id.length <= 200 &&
      ['openrouter','gemini'].includes(item.provider ?? 'openrouter')).slice(0, 30)
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

/** Picsart credentials and upstream host stay exclusively inside this Worker. */
/** Gamma API credentials stay exclusively inside this Worker. Only the three app-required routes are exposed. */
async function proxyGamma(request: Request, env: Env, path: string, bodyText: string) {
  if (!env.GAMMA_API_KEY) return errorResponse(503, 'Gamma API key is not configured in the AI Router', 'gamma_not_configured');
  const url = new URL(request.url);
  const pathname = path;
  const themeRequest = request.method === 'GET' && pathname === '/gamma/v1.0/themes';
  const createRequest = request.method === 'POST' && pathname === '/gamma/v1.0/generations';
  const statusRequest = request.method === 'GET' && /^\/gamma\/v1\.0\/generations\/[A-Za-z0-9_-]{1,200}$/.test(pathname);
  if (!themeRequest && !createRequest && !statusRequest)
    return errorResponse(404, 'Gamma route not found', 'gamma_route_not_found');
  const upstreamPath = pathname.slice('/gamma'.length) + url.search;
  const response = await fetch('https://public-api.gamma.app' + upstreamPath, {
    method: request.method,
    headers: {
      'X-API-KEY': env.GAMMA_API_KEY,
      Accept: 'application/json',
      ...(createRequest ? { 'Content-Type': 'application/json' } : {}),
    },
    body: request.method === 'GET' ? undefined : bodyText,
    signal: request.signal,
    redirect: 'manual',
  }).catch((error) => new Response(JSON.stringify({ message: String(error) }), {
    status: 502, headers: { 'Content-Type': 'application/json' },
  }));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.delete('set-cookie');
  return new Response(response.body, { status: response.status, headers });
}

function assetMime(bytes: Uint8Array, kind: string): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (kind === 'image') {
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
    if (bytes.length >= 12 && ascii(4,8) === 'ftyp' && ascii(8,16).includes('avif')) return 'image/avif';
  }
  if (kind === 'video') {
    if (bytes.length >= 12 && ascii(4,8) === 'ftyp') return 'video/mp4';
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  }
  return null;
}

/**
 * Moves a completed Picsart CDN object directly to its pre-signed private B2 target.
 * The Worker only accepts server-HMAC-authenticated requests, trusted Picsart URLs,
 * bounded objects and pre-signed Backblaze S3 URLs. Media bytes never pass through Next.js.
 */
async function transferPicsartAsset(request: Request, env: Env, bodyText: string, userId: string) {
  let input: {
    sourceUrl?: unknown;
    kind?: unknown;
    maxBytes?: unknown;
    targets?: unknown;
  };
  try { input = JSON.parse(bodyText); }
  catch { return errorResponse(400, 'Invalid media transfer request', 'invalid_media_transfer'); }
  const kind = input.kind === 'image' || input.kind === 'video' ? input.kind : null;
  const maxBytes = Number(input.maxBytes);
  if (!kind || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > (kind === 'image' ? 20 : 150) * 1024 * 1024)
    return errorResponse(400, 'Invalid media transfer limits', 'invalid_media_transfer');
  if (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > 4096)
    return errorResponse(400, 'Invalid Picsart asset URL', 'invalid_media_transfer');
  const targets = input.targets && typeof input.targets === 'object'
    ? input.targets as Record<string, { url?: unknown; key?: unknown }>
    : {};
  const allowedMimes = kind === 'image'
    ? ['image/png','image/jpeg','image/webp','image/avif']
    : ['video/mp4','video/webm'];
  for (const mime of allowedMimes) {
    const target = targets[mime];
    if (!target || typeof target.url !== 'string' || typeof target.key !== 'string' ||
        !target.key.startsWith('generated/' + userId + '/') || target.key.length > 512)
      return errorResponse(400, 'A pre-signed B2 upload target is missing', 'media_target_missing');
    try {
      const targetUrl = new URL(target.url);
      if (targetUrl.protocol !== 'https:' || !targetUrl.hostname.endsWith('.backblazeb2.com') ||
          !targetUrl.searchParams.has('X-Amz-Signature'))
        return errorResponse(400, 'Invalid private B2 upload target', 'media_target_invalid');
    } catch {
      return errorResponse(400, 'Invalid private B2 upload target', 'media_target_invalid');
    }
  }

  let source: URL;
  try { source = new URL(input.sourceUrl); }
  catch { return errorResponse(400, 'Invalid Picsart asset URL', 'picsart_asset_url_invalid'); }
  const assertPicsartHost = (url: URL) =>
    url.protocol === 'https:' && (url.hostname === 'picsart.com' || url.hostname.endsWith('.picsart.com'));
  if (!assertPicsartHost(source)) return errorResponse(400, 'Picsart asset URL is outside the trusted CDN', 'picsart_asset_url_untrusted');

  let response: Response | null = null;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(source, { method: 'GET', redirect: 'manual', signal: request.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === 3) return errorResponse(502, 'Picsart CDN redirect could not be followed safely', 'picsart_redirect_invalid');
        source = new URL(location, source);
        if (!assertPicsartHost(source)) return errorResponse(502, 'Picsart redirected outside its trusted CDN', 'picsart_redirect_untrusted');
        continue;
      }
      break;
    }
  } catch {
    return errorResponse(502, 'Could not download the generated file from Picsart', 'picsart_asset_download_failed');
  }
  if (!response || !response.ok || !response.body)
    return errorResponse(502, 'Picsart returned an unavailable or empty generated file', 'picsart_asset_download_failed');

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0)
    return errorResponse(502, 'Picsart CDN did not provide a valid Content-Length; the file was not buffered on the app server', 'picsart_asset_length_missing');
  if (declaredLength > maxBytes)
    return errorResponse(413, 'Generated asset exceeds the allowed size', 'picsart_asset_too_large');

  const reader = response.body.getReader();
  const initial: Uint8Array[] = [];
  let initialSize = 0;
  try {
    while (initialSize < 16) {
      const part = await reader.read();
      if (part.done) break;
      initial.push(part.value);
      initialSize += part.value.byteLength;
      if (initialSize > maxBytes) break;
    }
    const prefix = new Uint8Array(initialSize);
    let offset = 0;
    for (const part of initial) { prefix.set(part, offset); offset += part.byteLength; }
    if (prefix.byteLength > maxBytes || prefix.byteLength > declaredLength) {
      await reader.cancel().catch(() => undefined);
      return errorResponse(413, 'Generated asset exceeded its declared size', 'picsart_asset_too_large');
    }
    const mime = assetMime(prefix, kind);
    if (!mime || !allowedMimes.includes(mime)) {
      await reader.cancel().catch(() => undefined);
      return errorResponse(502, 'Picsart returned an invalid image/video file signature', 'picsart_asset_signature_invalid');
    }
    const target = targets[mime]!;
    let total = prefix.byteLength;
    let prefixPending = true;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (prefixPending) {
          prefixPending = false;
          if (prefix.byteLength) controller.enqueue(prefix);
          return;
        }
        try {
          const part = await reader.read();
          if (part.done) {
            if (total !== declaredLength) controller.error(new Error('Picsart asset length did not match Content-Length'));
            else controller.close();
            reader.releaseLock();
            return;
          }
          total += part.value.byteLength;
          if (total > maxBytes || total > declaredLength) {
            await reader.cancel().catch(() => undefined);
            controller.error(new Error('Picsart asset exceeded its declared size'));
            return;
          }
          controller.enqueue(part.value);
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => undefined);
        try { reader.releaseLock(); } catch { /* stream already released */ }
      },
    });
    let uploadUrl: URL;
    try { uploadUrl = new URL(String(target.url)); }
    catch { await reader.cancel().catch(() => undefined); return errorResponse(400, 'Invalid private B2 upload URL', 'media_target_invalid'); }
    let uploaded: Response;
    try {
      // A FixedLengthStream makes Workers emit the exact Content-Length for a
      // streamed request. A manually supplied Content-Length is ignored for a
      // normal ReadableStream and falls back to chunked transfer encoding.
      const fixedLength = new FixedLengthStream(declaredLength);
      const pump = stream.pipeTo(fixedLength.writable);
      const upload = fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: fixedLength.readable,
        signal: request.signal,
        redirect: 'manual',
      });
      [uploaded] = await Promise.all([upload, pump]);
    } catch {
      await reader.cancel().catch(() => undefined);
      return errorResponse(502, 'The Worker could not stream the exact-length Picsart file to private Backblaze storage', 'b2_stream_upload_failed');
    }
    if (!uploaded.ok)
      return errorResponse(502, 'Backblaze rejected the streamed generated file (' + uploaded.status + ')', 'b2_stream_upload_failed');
    return Response.json({ ok: true, storageKey: target.key, mime, sizeBytes: declaredLength }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    await reader.cancel().catch(() => undefined);
    return errorResponse(502, 'Could not safely transfer the generated file to Backblaze', 'media_transfer_failed');
  }
}

async function proxyPicsart(request: Request, env: Env, path: string, bodyText: string) {
  if (!env.PICSART_API_KEY) return errorResponse(503, 'Picsart API key is not configured in the AI Router', 'picsart_not_configured');
  const headers = new Headers({
    Authorization: 'Bearer ' + env.PICSART_API_KEY,
    'Content-Type': request.headers.get('content-type') ?? 'application/json',
    Accept: request.headers.get('accept') ?? 'application/json',
    platform: 'api',
    'X-Touchpoint': 'sdk',
  });
  const response = await fetch('https://api.picsart.com' + path, {
    method: request.method,
    headers,
    body: request.method === 'GET' ? undefined : bodyText,
    signal: request.signal,
    redirect: 'manual',
  }).catch((error) => new Response(JSON.stringify({ message: String(error) }), {
    status: 502, headers: { 'Content-Type': 'application/json' },
  }));
  const outHeaders = new Headers(response.headers);
  outHeaders.set('Cache-Control', 'no-store');
  outHeaders.set('X-Accel-Buffering', 'no');
  outHeaders.delete('set-cookie');
  return new Response(response.body, { status: response.status, headers: outHeaders });
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
      return Response.json({
        providers: keyStates,
        openrouterConfigured: !!env.OPENROUTER_API_KEY,
        picsartConfigured: !!env.PICSART_API_KEY,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') return handleChat(request, env, bodyText);
    if (url.pathname === '/openrouter/models' && request.method === 'GET')
      return proxyOpenRouter(request, env, '/models' + url.search, bodyText);
    if (url.pathname.startsWith('/gamma/'))
      return proxyGamma(request, env, url.pathname, bodyText);
    if (url.pathname === '/media/picsart-transfer' && request.method === 'POST')
      return transferPicsartAsset(request, env, bodyText, auth.userId);
    if (url.pathname.startsWith('/picsart/')) {
      const upstreamPath = url.pathname.slice('/picsart'.length) + url.search;
      return proxyPicsart(request, env, upstreamPath, bodyText);
    }
    if (url.pathname.startsWith('/v1/images') || url.pathname.startsWith('/v1/videos'))
      return proxyOpenRouter(request, env, url.pathname.replace(/^\/v1/, '') + url.search, bodyText);
    return errorResponse(404, 'Route not found', 'not_found');
  },
};
