# Ilm AI Cloudflare AI Router

This Worker is a private, signed gateway for the Next.js application. It supports OpenRouter, Groq and Gemini OpenAI-compatible chat endpoints; model selection; Groq-assisted Auto routing; deterministic fallback; streaming; provider key pools and Durable Object request replay/rate limits. Image and video requests are proxied only after HMAC authentication.

## Configure Cloudflare

1. Create a Worker named ilmai-ai-router and deploy from the repository root with: \`npx wrangler deploy --config workers/ai-router/wrangler.jsonc\`.
2. SQLite-backed Durable Objects are required. Review current Cloudflare plan limits and enable spend alerts before production usage.
3. Set secrets with \`npx wrangler secret put AI_ROUTER_SECRET --config workers/ai-router/wrangler.jsonc\` and \`npx wrangler secret put OPENROUTER_API_KEY --config workers/ai-router/wrangler.jsonc\`.
4. Add configured provider slots as secrets GROQ_API_KEY_1 … GROQ_API_KEY_10 and GEMINI_API_KEY_1 … GEMINI_API_KEY_10. Unconfigured slots are ignored.
5. Deploy: \`cd workers/ai-router && npm ci && npm test && npx wrangler deploy\`.

## Next.js variables

Set server-only AI_ROUTER_URL and AI_ROUTER_SECRET. Keep OPENROUTER_API_KEY for catalog discovery. Never put provider keys in NEXT_PUBLIC_ variables.

## Endpoints

- GET /health — public liveness only.
- GET /providers/health — signed provider slot health (never returns keys).
- POST /v1/chat/completions — signed chat/streaming; routing.provider=auto accepts a server-built candidate allowlist.
- POST /v1/images — signed OpenRouter image-generation proxy.
- POST|GET /v1/videos... — signed OpenRouter video-generation proxy.

Each protected request signs timestamp, nonce, method, path and exact raw body with HMAC-SHA256. The Worker checks request age, nonce replay state and per-user rate limit. KeyPool serializes Groq/Gemini key allocation and applies cooldown after rate limits or provider failures.

## Local development

\`\`\`bash
cd workers/ai-router
npm ci
npm test
npx wrangler dev --local
\`\`\`

Use wrangler secret put for secrets; never commit a .dev.vars file. Configure spend alerts and review Durable Object limits before enabling production traffic.
