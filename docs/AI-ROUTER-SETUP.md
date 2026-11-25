# Cloudflare AI Router — deployment guide (Roman Urdu)

Ilm AI ka approved production design:

- **Coolify / Next.js:** login, user plans, credits wallet, conversation history, prompt preparation, database writes aur usage settlement.
- **Cloudflare Worker:** signed AI gateway, per-user rate limits, replay protection, routing, provider API calls, Gamma, OpenRouter model catalogue aur Picsart-to-B2 media streaming.
- **OpenRouter / Gamma / Picsart:** provider APIs called from the Worker only; provider credentials are not needed by the Next.js app.

Browser kabhi bhi OpenRouter, Groq ya Gemini ko direct call nahi karta. Provider keys sirf server-side secrets mein rehti hain.

## 1. Cloudflare Worker deployment status

Worker `ilmai-ai-router` is account par deploy ho chuka hai:

`https://ilmai-ai-router.ilmai.workers.dev`

Iske `RequestGate` aur `KeyPool` SQLite Durable Objects provision ho chuke hain. Live Cloudflare check ke mutabiq tamam 20 numbered Groq/Gemini key names maujood hain. In mein se 5 provider keys aur dono base keys Secret type mein hain; baqi 15 provider keys abhi plain-text Variables hain. Unki values ko is check mein read ya change nahi kiya gaya.

Coolify main app par `AI_ROUTER_URL` aur matching `AI_ROUTER_SECRET` required hain. OpenRouter aur Gamma provider credentials Cloudflare Worker secrets mein rehte hain; unhein Coolify se remove karna hai after the Worker version is deployed and verified.

Agar future mein Worker ko dobara deploy karna ho, repo ke `workers/ai-router` folder mein:
```bash
npm ci
npm run typecheck
npm test
npx wrangler deploy
```

Worker ka HMAC secret Coolify aur Cloudflare dono jagah identical hona chahiye. Secret values ko GitHub ya chat mein share mat karo.

## 2. Provider bindings and Wrangler validation

Live Cloudflare check mein ye 20 numbered names present hain:

- `GROQ_API_KEY_1`–`GROQ_API_KEY_10`
- `GEMINI_API_KEY_1`–`GEMINI_API_KEY_10`

Current live types:
- Secret: `GROQ_API_KEY_1`, `GROQ_API_KEY_2`, `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_10`.
- Plain-text Variable: `GROQ_API_KEY_3`–`GROQ_API_KEY_10`, `GEMINI_API_KEY_3`–`GEMINI_API_KEY_9`.

`workers/ai-router/wrangler.jsonc` mein `keep_vars: true` set hai, taake future Wrangler deploy dashboard ke existing variables ko overwrite na kare. `secrets.required` filhal sirf 7 confirmed Secrets declare karta hai: `AI_ROUTER_SECRET`, `OPENROUTER_API_KEY`, `GROQ_API_KEY_1`, `GROQ_API_KEY_2`, `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_10`. Jab baqi 15 keys Secret type mein convert ho jayen, unke names bhi `secrets.required` mein add karne hain.

Sensitive API keys ke liye plain-text Variable ke bajaye **Secret** type use karo. Existing entry ko same name aur same value ke saath Secret ke taur par dobara add karo; values GitHub ya chat mein share mat karo.

Current code usage:
- `GROQ_API_KEY_1`–`GROQ_API_KEY_10` provide the round-robin key pool for prompt enhancement, first-message chat titles and comparison summaries. Auto model selection no longer uses Groq.
- Worker mein Groq/Gemini direct provider calls ka support maujood hai, lekin current Next.js chat route candidates abhi `provider: 'openrouter'` set karta hai. Is liye keys add karne se Groq/Gemini models apne aap model picker mein appear nahi honge; model catalogue/picker aur provider mapping ka code integration abhi alag se karna hai.
- Har provider ke maximum 10 numbered slots supported hain.

## 3. Coolify main app variables

Coolify → main Ilm AI app → Environment Variables mein:

| Variable | Value kahan se aayegi |
|---|---|
| `AI_ROUTER_URL` | `https://ilmai-ai-router.ilmai.workers.dev` (base URL only; endpoint path add nahi karna) |
| `AI_ROUTER_SECRET` | Wahi random HMAC secret jo Worker par `AI_ROUTER_SECRET` ke naam se set kiya |
| `AI_ROUTER_SECRET` | Wahi random HMAC secret jo Worker par `AI_ROUTER_SECRET` ke naam se set kiya |

Important: `OPENROUTER_API_KEY`, `GAMMA_API_KEY`, `PICSART_API_KEY`, Groq aur Gemini keys Cloudflare Worker Secrets mein hi rakho. Coolify app par sirf `AI_ROUTER_URL` aur matching `AI_ROUTER_SECRET` chahiye. `AI_ROUTER_SECRET` ki Coolify aur Worker mein exact same value honi chahiye.

Ye variables kabhi `NEXT_PUBLIC_*` na banana. Coolify mein values set karne ke baad main Next.js app redeploy karo.

## 4. Request flow

1. Browser request Coolify Next.js API ko bhejta hai.
2. Coolify user login, plan, permissions aur credit balance verify karta hai; prompt/history prepare karta hai.
3. Coolify request body/path ko timestamp + nonce ke saath HMAC-SHA256 sign karta hai.
4. Cloudflare Worker signature/replay validate karta hai, per-user limit lagata hai aur inference request OpenRouter ko proxy karta hai.
5. Response Worker se Coolify aur phir browser tak stream hota hai.
6. Coolify actual provider token usage/cost save karta hai aur wallet credits settle karta hai.

Manually selected text models and Auto mode inference use OpenRouter; Auto selection is deterministic and does not call Groq. Groq is reserved for prompt enhancement, first-message chat titles and comparison summaries. Gemini remains dedicated to image understanding. Manually selected model fail ho to app chupke se doosra model select nahi karti.

## 5. Verification checklist

- [ ] Worker name `ilmai-ai-router` aur Durable Objects deploy successfully.
- [x] Live Worker par `AI_ROUTER_SECRET`, `OPENROUTER_API_KEY` aur tamam 20 numbered provider key names present hain; abhi 15 provider entries plain-text Variables hain.
- [ ] Coolify par `AI_ROUTER_URL`, matching `AI_ROUTER_SECRET` aur `OPENROUTER_API_KEY` configured hon; phir main app redeploy ho.
- [ ] Main app redeploy ho aur signed chat request successful ho.
- [ ] Admin → Usage mein model, input/output tokens, actual USD cost aur credits usage save ho.
- [ ] Worker Cloudflare dashboard mein errors, CPU/time limits aur spend alerts monitor hon.

`GET /health` sirf Worker liveness check hai; is se provider key configured hone ka proof nahi milta. Protected provider-health endpoint signed request maangta hai. Secrets ya signed headers browser mein kabhi expose mat karna.

## 6. Code ownership

- Worker code: `workers/ai-router/`
- Coolify signed client: `src/lib/ai-router.ts`
- OpenRouter catalogue-only client: `src/lib/openrouter.ts`
- Runtime variables template: `.env.example`
- Architecture diagram/flow: `docs/ARCHITECTURE.md`

OpenRouter model catalogue, normal chat, quiz/test, suggestions, prompt enhancement, chat title, comparison summary, Gamma themes/generation/status, aur Picsart image/video API sab signed Cloudflare AI Router se guzarte hain. Generated Picsart media ko Worker direct private B2 presigned URLs par stream karta hai. Next.js user authentication, wallet/database operations aur metadata persistence hi handle karta hai; direct provider inference ya direct provider API keys app server par add nahi karna.
