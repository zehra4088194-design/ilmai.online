# Ilm AI Cloudflare AI Router

The Worker is the **only provider-inference gateway** for the Next.js application. Coolify performs user authentication, plan/credit checks, prompt and conversation preparation, then sends signed requests to this Worker. The Worker verifies HMAC signatures, applies per-user replay/rate protection, and proxies to the configured provider without exposing provider credentials to the browser.

**Provider topology:** OpenRouter handles normal text-chat inference, text-model catalogue discovery and utility suggestions. Groq is reserved for prompt enhancement, new-chat title generation and multi-model comparison summaries. Gemini handles chat-image understanding. Gamma handles presentation themes, generation and status polling. Picsart is the image/video generation provider and its live catalogue is the source of truth for media model IDs, parameter schemas and routing.

## Configure Cloudflare

Run from the repository root, or use equivalent commands from `workers/ai-router`:

1. Create the Worker shell once in Cloudflare Dashboard → Workers & Pages → Create Worker. Name it exactly `ilmai-ai-router` and deploy the starter Hello World script. This bootstrap is needed before Wrangler can attach secrets.
2. In a terminal, install and verify the code:
   ```bash
   cd workers/ai-router
   npm ci
   npm run typecheck
   npm test
   npx wrangler login
   ```
3. Set the required Worker secrets using Wrangler's interactive prompts:
   ```bash
   npx wrangler secret put AI_ROUTER_SECRET
   npx wrangler secret put OPENROUTER_API_KEY
   npx wrangler secret put PICSART_API_KEY
   npx wrangler secret put GAMMA_API_KEY
   ```
   `AI_ROUTER_SECRET` must be a newly generated random secret. `OPENROUTER_API_KEY` is used for text inference. `PICSART_API_KEY` is the Picsart API Platform key used only for image/video catalogue and workflows. `GAMMA_API_KEY` is used for Gamma themes, presentation generation and status polling. It must be a Worker Secret, not a Coolify application variable. Never put secret values in source control, `.env.example`, Worker vars, Supabase, or browser-side `NEXT_PUBLIC_*` values.
4. Deploy the repository's Worker code and inspect configured secret names (not values):
   ```bash
   npx wrangler deploy
   npx wrangler secret list
   ```
5. Wrangler prints the deployed Worker URL, normally `https://ilmai-ai-router.<account-subdomain>.workers.dev`. Copy the actual URL; do not use the example hostname.
6. Optional secrets are added from Cloudflare Dashboard → Workers & Pages → `ilmai-ai-router` → Settings → Variables and Secrets → Add → Secret. Use names `GROQ_API_KEY_1` through `GROQ_API_KEY_10`, and `GEMINI_API_KEY_1` through `GEMINI_API_KEY_10`. Prompt enhancement, new-chat titles and comparison summaries use Groq-hosted GPT-OSS/Qwen models only; suggestions use the OpenRouter utility-model pool. For chat image attachments, Gemini extracts a text report; only that text reaches the selected answer model, while the original image remains visible beside the user's message.

SQLite-backed Durable Objects are required for request replay/rate protection and key pools. Review Cloudflare plan limits and enable spend alerts before production usage.

## Picsart media generation

- The Next.js app requests the live Picsart model catalogue through the signed `/picsart/gw-v2/v1/models-catalog` Worker route, including schema, constraints and routing metadata for image and video modes.
- Image and video generations use the Picsart dynamic `v1/models` workflow. Short/synchronous image models use `execute`; asynchronous models and videos use `submit` followed by `result` polling.
- The Worker pins the upstream origin to `https://api.picsart.com`, adds the Picsart Bearer token server-side, and does not accept a caller-supplied host.
- Image and video output URLs are validated as HTTPS Picsart CDN URLs, size-limited and streamed by this Worker directly into user-specific private Backblaze B2 keys through short-lived server-signed PUT URLs. Generated media bytes no longer pass through the Coolify/Next.js app server.
- Provider-reported Picsart credits are recorded as provider usage metadata; they are **not** treated as Ilm AI wallet credits. The app retains its own admin-configured generation prices and reservation/refund logic.
- Admin → Models → Picsart image & video models shows all non-deprecated models returned by the live catalogue. Enable/disable models and set an independent default for each mode. Newly published Picsart models appear after catalogue refresh; unsupported/custom IDs are not fabricated.

If the Worker has no `PICSART_API_KEY` secret, the media catalogue and generation routes return a configuration error. The current connected Cloudflare account is missing this binding: add it as a Secret, then deploy and test before enabling image/video generation. The Gamma key binding is already present.

## Coolify Next.js variables

Set these on the **main Ilm AI app**:

- `AI_ROUTER_URL`: the base Worker URL only (no API endpoint suffix).
- `AI_ROUTER_SECRET`: the exact same secret value as the Worker's `AI_ROUTER_SECRET`.
- No OpenRouter, Gamma or Picsart provider API keys are required in Coolify. They remain as Cloudflare Worker Secrets. Coolify only uses the HMAC gateway credentials.

Do **not** put `PICSART_API_KEY` in Coolify. Keep it as a Cloudflare Worker secret. Redeploy the Next.js app after changing its server-only variables.

## Request flow

1. Browser → Coolify Next.js API (the browser never calls a model provider).
2. Coolify authenticates the user, checks plan/features and Ilm AI wallet credits, and prepares the model request.
3. Coolify signs the exact method/path/body with HMAC-SHA256, timestamp and nonce.
4. Cloudflare Worker validates the signature and nonce, enforces per-user limits, then routes text inference to OpenRouter and image/video catalog or workflow requests to Picsart.
5. Response returns Worker → Coolify → browser. Coolify records provider usage and settles Ilm AI wallet credits separately.

Manual text-model selection does not silently switch to another model on failure. Auto mode may choose and fail over among the server-approved text-model candidate list. Picsart image/video model availability is controlled by the live Picsart catalogue and the admin's enabled/default settings.

## Endpoints

- `GET /health` — public liveness only; does not prove provider credentials are configured.
- `GET /providers/health` — HMAC-signed provider configuration/slot health (never returns keys).
- `POST /v1/chat/completions` — signed OpenRouter/Groq/Gemini chat routing.
- `GET /openrouter/models` — signed OpenRouter model catalogue proxy.
- `GET /gamma/v1.0/themes` and `POST /gamma/v1.0/generations` plus `GET /gamma/v1.0/generations/{id}` — signed Gamma proxy.
- `POST /media/picsart-transfer` — signed, size-limited stream from trusted Picsart CDN to a short-lived presigned private B2 PUT target.
- `GET /picsart/gw-v2/v1/models-catalog` — signed Picsart image/video catalogue proxy.
- `POST /picsart/gw-v2/workflows/v1/models/execute` — synchronous Picsart generation.
- `POST /picsart/gw-v2/workflows/v1/models/submit` and `GET /picsart/gw-v2/workflows/v1/models/{id}/result` — asynchronous Picsart generation and status polling.

## Local development

```bash
cd workers/ai-router
npm ci
npm run typecheck
npm test
npx wrangler dev --local
```

Use `wrangler secret put` for secrets; never commit a `.dev.vars` file. Configure spend alerts and review Durable Object limits before enabling production traffic.
