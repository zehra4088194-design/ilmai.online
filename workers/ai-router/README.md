# Ilm AI Cloudflare AI Router

The Worker is the **only provider-inference gateway** for the Next.js application. Coolify performs user authentication, plan/credit checks, prompt and conversation preparation, then sends a signed request to this Worker. The Worker verifies HMAC signatures, applies per-user replay/rate protection and streams the provider response back.

**Initial production topology:** OpenRouter is the primary model catalogue and inference gateway. Coolify reads the public model catalogue/prices from OpenRouter server-side. All text/image/video inference requests go through this Worker, which calls OpenRouter. Optional Groq keys can improve Auto model selection; optional Groq/Gemini provider slots support future explicitly configured routes.

## Configure Cloudflare

Run from the repository root, or use the equivalent commands from `workers/ai-router`:

1. Create the Worker shell once in Cloudflare Dashboard → Workers & Pages → Create Worker. Name it exactly `ilmai-ai-router` and deploy the starter Hello World script. This bootstrap is needed before Wrangler can attach secrets to the Worker.
2. In a terminal, install and verify the code:
   ```bash
   cd workers/ai-router
   npm ci
   npm run typecheck
   npm test
   npx wrangler login
   ```
3. Set both required Worker secrets using Wrangler's interactive prompts:
   ```bash
   npx wrangler secret put AI_ROUTER_SECRET
   npx wrangler secret put OPENROUTER_API_KEY
   ```
   `AI_ROUTER_SECRET` must be a newly generated random secret. `OPENROUTER_API_KEY` is the OpenRouter key used by this Worker for inference; the same OpenRouter key is also configured separately in Coolify for catalogue discovery. Never put secret values in source control, `.env.example`, Worker vars, or browser-side `NEXT_PUBLIC_*` values.
4. Deploy the repository's Worker code and inspect configured secret names (not values):
   ```bash
   npx wrangler deploy
   npx wrangler secret list
   ```
5. Wrangler prints the deployed Worker URL, normally `https://ilmai-ai-router.<account-subdomain>.workers.dev`. Copy the actual URL; do not use the example hostname.
6. Optional: add `GROQ_API_KEY_1` to enable the Groq-assisted Auto model selector. Add `GEMINI_API_KEY_1` or additional numbered provider slots (up to 10 per provider) only if enabling those direct provider routes. Without a Groq routing key, Auto mode falls back to deterministic candidate priority; manually selected models continue through OpenRouter.

SQLite-backed Durable Objects are required for request replay/rate protection and key pools. Review Cloudflare plan limits and enable spend alerts before production usage.

## Coolify Next.js variables

Set these on the **main Ilm AI app**:

- `AI_ROUTER_URL`: the base Worker URL only (no `/v1/chat/completions` suffix).
- `AI_ROUTER_SECRET`: the exact same secret value as the Worker's `AI_ROUTER_SECRET`.
- `OPENROUTER_API_KEY`: the OpenRouter key for server-side model catalogue/pricing discovery. Configure the same OpenRouter key separately as the Worker secret above.

Redeploy the Next.js app after updating variables. Keep all three server-only. Never expose provider keys or the HMAC secret in `NEXT_PUBLIC_*` values.

## Request flow

1. Browser → Coolify Next.js API (the browser never calls a provider).
2. Coolify authenticates the user, checks plan/features and credit balance, and prepares the model request.
3. Coolify signs the exact method/path/body with HMAC-SHA256, timestamp and nonce.
4. Cloudflare Worker validates the signature and nonce, enforces per-user limits, then sends inference to OpenRouter (or an explicitly server-approved direct provider route).
5. Response streams Worker → Coolify → browser. Coolify records provider-reported token usage/cost and settles wallet credits.

Manual model selection does not silently switch to a different model on failure. Auto mode may choose and fail over among the server-approved candidate list. Provider names shown in the picker are model publishers/namespaces from the OpenRouter catalogue; the initial production inference route remains OpenRouter.

## Endpoints

- `GET /health` — public liveness only; does not prove provider credentials are configured.
- `GET /providers/health` — HMAC-signed provider slot health (never returns keys).
- `POST /v1/chat/completions` — signed chat/streaming; `routing.provider=auto` accepts a server-built candidate allowlist.
- `POST /v1/images` — signed OpenRouter image-generation proxy.
- `POST|GET /v1/videos...` — signed OpenRouter video-generation proxy.

## Local development

```bash
cd workers/ai-router
npm ci
npm run typecheck
npm test
npx wrangler dev --local
```

Use `wrangler secret put` for secrets; never commit a `.dev.vars` file. Configure spend alerts and review Durable Object limits before enabling production traffic.
