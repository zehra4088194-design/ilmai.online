var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/security.ts
var encoder = new TextEncoder();
function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
__name(hmacSha256, "hmacSha256");
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
async function verifyRequest(input) {
  const timestamp = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!input.secret || !Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 6e4) return false;
  if (!/^[a-f0-9-]{20,80}$/i.test(input.nonce)) return false;
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const signed = [input.timestamp, input.nonce, input.method.toUpperCase(), input.pathname, input.body].join(".");
  return constantTimeEqual(await hmacSha256(input.secret, signed), input.signature.toLowerCase());
}
__name(verifyRequest, "verifyRequest");

// src/providers.ts
var OPENROUTER_BASE = "https://openrouter.ai/api/v1";
var GROQ_BASE = "https://api.groq.com/openai/v1";
var GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
async function keyRequest(env, provider, action, extra = {}) {
  const stub = env.KEY_POOLS.get(env.KEY_POOLS.idFromName(provider));
  const response = await stub.fetch("https://key-pool.internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, provider, ...extra })
  });
  return { response, data: await response.json().catch(() => ({})) };
}
__name(keyRequest, "keyRequest");
async function lease(env, provider) {
  const result = await keyRequest(env, provider, "acquire");
  if (!result.response.ok) return null;
  return { provider, slot: Number(result.data.slot), key: String(result.data.key ?? "") };
}
__name(lease, "lease");
async function report(env, key, status) {
  await keyRequest(env, key.provider, "report", { slot: key.slot, status }).catch(() => void 0);
}
__name(report, "report");
function providerUrl(provider) {
  if (provider === "groq") return GROQ_BASE + "/chat/completions";
  if (provider === "gemini") return GEMINI_BASE + "/chat/completions";
  return OPENROUTER_BASE + "/chat/completions";
}
__name(providerUrl, "providerUrl");
async function callChatProvider(env, candidate, payload, signal) {
  const provider = candidate.provider ?? "openrouter";
  if (provider === "openrouter") {
    if (!env.OPENROUTER_API_KEY) return { response: Response.json({ error: "OpenRouter is not configured" }, { status: 503 }), model: candidate.id, provider, attempts: 0 };
    const response = await fetch(providerUrl(provider), {
      method: "POST",
      headers: { Authorization: "Bearer " + env.OPENROUTER_API_KEY, "Content-Type": "application/json", "HTTP-Referer": "https://ilmai.online", "X-Title": "Ilm AI" },
      body: JSON.stringify({ ...payload, model: candidate.id }),
      signal
    }).catch((error) => new Response(JSON.stringify({ error: String(error) }), { status: 502, headers: { "Content-Type": "application/json" } }));
    return { response, model: candidate.id, provider, attempts: 1 };
  }
  let attempts = 0;
  let last = new Response("Provider keys are not configured", { status: 503 });
  while (attempts < 10) {
    const current = await lease(env, provider);
    if (!current) return { response: last, model: candidate.id, provider, attempts };
    attempts++;
    const response = await fetch(providerUrl(provider), {
      method: "POST",
      headers: { Authorization: "Bearer " + current.key, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, model: candidate.id }),
      signal
    }).catch((error) => new Response(JSON.stringify({ error: String(error) }), { status: 502, headers: { "Content-Type": "application/json" } }));
    await report(env, current, response.status);
    if (response.ok || response.status < 500 && response.status !== 429) return { response, model: candidate.id, provider, attempts };
    last = response;
  }
  return { response: last, model: candidate.id, provider, attempts };
}
__name(callChatProvider, "callChatProvider");
async function routeAuto(env, candidates, messages, hints) {
  if (!candidates.length) throw new Error("No model candidates are available for Auto routing");
  const sorted = [...candidates].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const routingKey = await lease(env, "groq");
  if (routingKey) {
    const prompt = [
      "Choose exactly one model ID from the candidate JSON. Return only the ID.",
      "Choose the best capability fit. Respect vision and document requirements. Prefer low latency for simple requests and stronger quality for complex reasoning, mathematics and long writing.",
      "Task hints: " + hints,
      "Candidates: " + JSON.stringify(sorted)
    ].join("\n");
    const response = await fetch(providerUrl("groq"), {
      method: "POST",
      headers: { Authorization: "Bearer " + routingKey.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.ROUTING_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(messages).slice(0, 12e3) }],
        temperature: 0,
        max_tokens: 64
      }),
      signal: AbortSignal.timeout(Number(env.ROUTING_TIMEOUT_MS || 8e3))
    }).catch(() => new Response(null, { status: 502 }));
    await report(env, routingKey, response.status);
    if (response.ok) {
      const json = await response.json().catch(() => ({}));
      const choice = (json.choices?.[0]?.message?.content ?? "").trim().replace(/^["']+|["']+$/g, "");
      const match = sorted.find((item) => item.id === choice);
      if (match) return match;
    }
  }
  const hint = hints.toLowerCase();
  const required = hint.includes("image") || hint.includes("vision") ? "vision" : hint.includes("pdf") || hint.includes("document") ? "document" : void 0;
  const capable = required ? sorted.filter((item) => item.modalities?.includes(required)) : sorted;
  return (capable.length ? capable : sorted)[0];
}
__name(routeAuto, "routeAuto");
async function fetchOpenRouter(env, path, init = {}) {
  if (!env.OPENROUTER_API_KEY) return new Response("OpenRouter is not configured", { status: 503 });
  return fetch(OPENROUTER_BASE + path, {
    ...init,
    headers: { Authorization: "Bearer " + env.OPENROUTER_API_KEY, "HTTP-Referer": "https://ilmai.online", "X-Title": "Ilm AI", ...init.headers ?? {} }
  });
}
__name(fetchOpenRouter, "fetchOpenRouter");

// src/durable-objects.ts
var KEY_COOLDOWN_429 = 3e4;
var KEY_COOLDOWN_SERVER = 15e3;
var KEY_COOLDOWN_AUTH = 60 * 6e4;
function slotKey(env, provider, slot) {
  const property = provider.toUpperCase() + "_API_KEY_" + slot;
  const value = env[property];
  return typeof value === "string" && value.length > 0 ? value : null;
}
__name(slotKey, "slotKey");
var RequestGate = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ready = state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec("CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
      state.storage.sql.exec("CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL)");
    });
  }
  state;
  env;
  static {
    __name(this, "RequestGate");
  }
  ready;
  async fetch(request) {
    await this.ready;
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const payload = await request.json();
    const nonce = String(payload.nonce ?? "");
    const timestamp = Number(payload.timestamp);
    const now = Date.now();
    if (!nonce || !Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 6e4)
      return Response.json({ error: "stale_request" }, { status: 401 });
    this.state.storage.sql.exec("DELETE FROM nonces WHERE expires_at < ?", now);
    const inserted = this.state.storage.sql.exec(
      "INSERT OR IGNORE INTO nonces(nonce,expires_at) VALUES(?,?) RETURNING nonce",
      nonce,
      now + 12e4
    ).toArray();
    if (!inserted.length) return Response.json({ error: "replay_detected" }, { status: 409 });
    const windowStart = now - 6e4;
    this.state.storage.sql.exec("DELETE FROM requests WHERE created_at < ?", windowStart);
    const count = this.state.storage.sql.exec(
      "SELECT COUNT(*) AS count FROM requests WHERE created_at >= ?",
      windowStart
    ).toArray()[0]?.count ?? 0;
    const limit = Math.max(1, Math.min(1e3, Number(payload.userLimit ?? this.env.USER_REQUESTS_PER_MINUTE ?? 30)));
    if (count >= limit) return Response.json({ error: "rate_limited", retryAfter: 60 }, { status: 429 });
    this.state.storage.sql.exec("INSERT INTO requests(created_at) VALUES(?)", now);
    return Response.json({ ok: true, remaining: limit - count - 1 });
  }
};
var KeyPool = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ready = state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS key_slots (provider TEXT NOT NULL, slot INTEGER NOT NULL, last_used INTEGER NOT NULL DEFAULT 0, cooldown_until INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(provider,slot))"
      );
    });
  }
  state;
  env;
  static {
    __name(this, "KeyPool");
  }
  ready;
  async fetch(request) {
    await this.ready;
    const body = await request.json();
    const provider = body.provider;
    if (provider !== "groq" && provider !== "gemini") return Response.json({ error: "invalid_provider" }, { status: 400 });
    if (body.action === "acquire") {
      const configured = [];
      for (let slot = 1; slot <= 10; slot++) if (slotKey(this.env, provider, slot)) configured.push(slot);
      if (!configured.length) return Response.json({ error: "provider_not_configured" }, { status: 503 });
      for (const slot of configured) this.state.storage.sql.exec("INSERT OR IGNORE INTO key_slots(provider,slot) VALUES(?,?)", provider, slot);
      const now = Date.now();
      const available = this.state.storage.sql.exec(
        "SELECT slot FROM key_slots WHERE provider=? AND slot IN (" + configured.map(() => "?").join(",") + ") AND cooldown_until<=? ORDER BY last_used ASC, slot ASC LIMIT 1",
        provider,
        ...configured,
        now
      ).toArray()[0]?.slot;
      if (available === void 0) {
        const earliest = this.state.storage.sql.exec(
          "SELECT MIN(cooldown_until) AS cooldown_until FROM key_slots WHERE provider=?",
          provider
        ).toArray()[0]?.cooldown_until ?? now + 3e4;
        return Response.json({ error: "all_keys_cooling_down", retryAfterMs: Math.max(1e3, earliest - now) }, { status: 429 });
      }
      this.state.storage.sql.exec("UPDATE key_slots SET last_used=? WHERE provider=? AND slot=?", now, provider, available);
      return Response.json({ provider, slot: available, key: slotKey(this.env, provider, available) });
    }
    if (body.action === "report") {
      const slot = Number(body.slot);
      const status = Number(body.status ?? 0);
      if (!Number.isInteger(slot) || slot < 1 || slot > 10) return Response.json({ error: "invalid_slot" }, { status: 400 });
      let cooldown = 0;
      if (status === 401 || status === 403) cooldown = Date.now() + KEY_COOLDOWN_AUTH;
      else if (status === 429) cooldown = Date.now() + KEY_COOLDOWN_429;
      else if (status >= 500) cooldown = Date.now() + KEY_COOLDOWN_SERVER;
      this.state.storage.sql.exec(
        "UPDATE key_slots SET cooldown_until=?, failures=MAX(0,failures+?) WHERE provider=? AND slot=?",
        cooldown,
        status >= 400 ? 1 : -1,
        provider,
        slot
      );
      return Response.json({ ok: true });
    }
    if (body.action === "health") {
      const slots = this.state.storage.sql.exec(
        "SELECT slot,cooldown_until,failures FROM key_slots WHERE provider=? ORDER BY slot",
        provider
      ).toArray().map((row) => ({
        slot: row.slot,
        configured: !!slotKey(this.env, provider, row.slot),
        coolingDown: row.cooldown_until > Date.now(),
        failures: row.failures
      }));
      return Response.json({ provider, configuredCount: configuredSlots(this.env, provider), slots });
    }
    return Response.json({ error: "invalid_action" }, { status: 400 });
  }
};
function configuredSlots(env, provider) {
  let n = 0;
  for (let i = 1; i <= 10; i++) if (slotKey(env, provider, i)) n++;
  return n;
}
__name(configuredSlots, "configuredSlots");

// src/index.ts
var MAX_BODY = 4 * 1024 * 1024;
function errorResponse(status, error, code) {
  return Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}
__name(errorResponse, "errorResponse");
async function authenticate(request, env, rawBody) {
  const timestamp = request.headers.get("x-ilm-timestamp") ?? "";
  const nonce = request.headers.get("x-ilm-nonce") ?? "";
  const signature = request.headers.get("x-ilm-signature") ?? "";
  const userId = request.headers.get("x-ilm-user-id") ?? "";
  const requestId = request.headers.get("x-ilm-request-id") ?? "";
  if (!userId || userId.length > 100 || !requestId || requestId.length > 100)
    return { ok: false, response: errorResponse(401, "Missing signed request identity", "unauthorized") };
  const valid = await verifyRequest({
    secret: env.AI_ROUTER_SECRET,
    timestamp,
    nonce,
    method: request.method,
    pathname: new URL(request.url).pathname + new URL(request.url).search,
    body: rawBody,
    signature
  });
  if (!valid) return { ok: false, response: errorResponse(401, "Invalid or expired signature", "invalid_signature") };
  const gate = env.REQUEST_GATES.get(env.REQUEST_GATES.idFromName(userId));
  const gated = await gate.fetch("https://request-gate.internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamp: Number(timestamp), nonce, userLimit: Number(env.USER_REQUESTS_PER_MINUTE || 30) })
  });
  if (!gated.ok) return { ok: false, response: new Response(await gated.text(), { status: gated.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }) };
  return { ok: true, userId, requestId };
}
__name(authenticate, "authenticate");
async function handleChat(request, env, bodyText) {
  let input;
  try {
    input = JSON.parse(bodyText);
  } catch {
    return errorResponse(400, "Invalid JSON body", "invalid_json");
  }
  const routing = input.routing ?? {};
  delete input.routing;
  const modelId = typeof input.model === "string" ? input.model : routing.model;
  const candidates = Array.isArray(routing.candidates) ? routing.candidates.filter((item) => item && typeof item.id === "string" && item.id.length <= 200 && ["openrouter", "groq", "gemini"].includes(item.provider ?? "openrouter")).slice(0, 30) : [];
  let chosen;
  if (routing.provider === "auto") {
    if (!candidates.length) return errorResponse(400, "Auto routing requires server-approved candidate models", "no_auto_candidates");
    try {
      chosen = await routeAuto(env, candidates, Array.isArray(input.messages) ? input.messages : [], String(routing.hints ?? ""));
    } catch {
      chosen = candidates.slice().sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))[0];
    }
  } else {
    chosen = { id: modelId ?? "", provider: routing.provider ?? "openrouter" };
    if (candidates.length && !candidates.some((item) => item.id === chosen?.id && (item.provider ?? "openrouter") === chosen?.provider))
      return errorResponse(400, "The requested model is not in the server-approved candidate list", "model_not_allowed");
  }
  if (!chosen?.id || chosen.id.length > 200) return errorResponse(400, "A valid model is required", "invalid_model");
  const payload = { ...input, model: chosen.id };
  let routed = await callChatProvider(env, chosen, payload, request.signal);
  if (!routed.response.ok && candidates.length) {
    const fallbacks = candidates.filter((item) => item.id !== chosen.id).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const fallback of fallbacks.slice(0, 3)) {
      routed = await callChatProvider(env, fallback, payload, request.signal);
      if (routed.response.ok) {
        chosen = fallback;
        break;
      }
    }
  }
  const headers = new Headers(routed.response.headers);
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");
  headers.set("x-ilm-model", chosen.id);
  headers.set("x-ilm-provider", chosen.provider ?? "openrouter");
  headers.set("x-ilm-router-attempts", String(routed.attempts));
  return new Response(routed.response.body, { status: routed.response.status, headers });
}
__name(handleChat, "handleChat");
async function proxyOpenRouter(request, env, path, bodyText) {
  const response = await fetchOpenRouter(env, path, {
    method: request.method,
    headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" },
    body: request.method === "GET" ? void 0 : bodyText,
    signal: request.signal
  });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Accel-Buffering", "no");
  return new Response(response.body, { status: response.status, headers });
}
__name(proxyOpenRouter, "proxyOpenRouter");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health")
      return Response.json({ ok: true, service: "ilmai-ai-router", version: "1" });
    const bodyText = request.method === "GET" ? "" : await request.text();
    if (bodyText.length > MAX_BODY) return errorResponse(413, "Request body is too large", "payload_too_large");
    const auth = await authenticate(request, env, bodyText);
    if (!auth.ok) return auth.response;
    if (request.method === "GET" && url.pathname === "/providers/health") {
      const keyStates = await Promise.all(["groq", "gemini"].map(async (provider) => {
        const stub = env.KEY_POOLS.get(env.KEY_POOLS.idFromName(provider));
        const response = await stub.fetch("https://key-pool.internal/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "health", provider })
        });
        return response.json();
      }));
      return Response.json({ providers: keyStates, openrouterConfigured: !!env.OPENROUTER_API_KEY }, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "POST" && url.pathname === "/v1/chat/completions") return handleChat(request, env, bodyText);
    if (url.pathname === "/v1/images" || url.pathname.startsWith("/v1/videos"))
      return proxyOpenRouter(request, env, url.pathname.replace(/^\/v1/, "") + url.search, bodyText);
    return errorResponse(404, "Route not found", "not_found");
  }
};
export {
  KeyPool,
  RequestGate,
  index_default as default
};
//# sourceMappingURL=index.js.map
