# Cloudflare AI Router — deployment guide (Roman Urdu)

Ilm AI ka approved production design:

- **Coolify / Next.js:** login, user plans, credits wallet, conversation history, prompt preparation, database writes aur usage settlement.
- **Cloudflare Worker:** signed AI gateway, per-user rate limits, replay protection, routing aur provider response streaming.
- **OpenRouter:** live model catalogue + base token prices ka source; initial production setup mein primary inference gateway bhi.

Browser kabhi bhi OpenRouter, Groq ya Gemini ko direct call nahi karta. Provider keys sirf server-side secrets mein rehti hain.

## 1. Cloudflare Worker deployment status

Worker `ilmai-ai-router` is account par deploy ho chuka hai:

`https://ilmai-ai-router.ilmai.workers.dev`

Iske `RequestGate` aur `KeyPool` SQLite Durable Objects provision ho chuke hain. `AI_ROUTER_SECRET` aur `OPENROUTER_API_KEY` dono Cloudflare Worker mein Secret ke taur par configured hain. Groq/Gemini ki 20 numbered keys ko abhi normal Variables se Secret type mein convert karna baqi hai.

Cloudflare Dashboard → Workers & Pages → `ilmai-ai-router` → Settings → Variables and Secrets mein `AI_ROUTER_SECRET` aur `OPENROUTER_API_KEY` Secret ke taur par configured hain. Groq/Gemini ki 20 numbered keys ko bhi normal Variables ke bajaye **Secrets** mein convert karna baqi hai.

Agar future mein Worker ko dobara deploy karna ho, repo ke `workers/ai-router` folder mein:
```bash
npm ci
npm run typecheck
npm test
npx wrangler deploy
```

Worker ka HMAC secret Coolify aur Cloudflare dono jagah identical hona chahiye. Secret values ko GitHub ya chat mein share mat karo.

## 2. Provider secrets and Wrangler validation

Production Worker ke liye ye 20 numbered provider keys Cloudflare mein **Secret** type honi chahiye (normal Variable nahi):

- `GROQ_API_KEY_1`–`GROQ_API_KEY_10`
- `GEMINI_API_KEY_1`–`GEMINI_API_KEY_10`

Inke saath `AI_ROUTER_SECRET` aur `OPENROUTER_API_KEY` mila kar 22 names `workers/ai-router/wrangler.jsonc` ke `secrets.required` mein declared hain. Iska matlab `wrangler deploy` aur `wrangler versions upload` tabhi succeed karenge jab saare 22 secrets Worker par configured hon. Secret values Wrangler config ya GitHub mein kabhi commit nahi karni.

Current code usage:
- `GROQ_API_KEY_1` Auto mode ke smart model chooser ko Groq-powered selection deta hai; baqi Groq slots key rotation/pooling ke liye available hain.
- Worker mein Groq/Gemini direct provider calls ka support maujood hai, lekin current Next.js chat route candidates abhi `provider: 'openrouter'` set karta hai. Is liye keys add karne se Groq/Gemini models apne aap model picker mein appear nahi honge; model catalogue/picker aur provider mapping ka code integration abhi alag se karna hai.
- Har provider ke maximum 10 numbered slots supported hain.

Dashboard se convert karte waqt har existing plain-text entry ko remove karke usi name/value ke saath **Secret** type mein dobara add karo. Changes save/deploy kar do. Values ko chat ya GitHub mein share nahi karna.

## 3. Coolify main app variables

Coolify → main Ilm AI app → Environment Variables mein:

| Variable | Value kahan se aayegi |
|---|---|
| `AI_ROUTER_URL` | `https://ilmai-ai-router.ilmai.workers.dev` (base URL only; endpoint path add nahi karna) |
| `AI_ROUTER_SECRET` | Wahi random HMAC secret jo Worker par `AI_ROUTER_SECRET` ke naam se set kiya |
| `OPENROUTER_API_KEY` | OpenRouter dashboard ki API key; catalogue aur prices fetch karne ke liye |

Important: OpenRouter API key ki **do server-side copies** hongi — ek Coolify app mein (model list/prices), ek Cloudflare Worker secret mein (inference). Dono same key ho sakti hain. `AI_ROUTER_SECRET` ki bhi Coolify aur Worker mein exact same value honi chahiye.

Ye variables kabhi `NEXT_PUBLIC_*` na banana. Coolify mein values set karne ke baad main Next.js app redeploy karo.

## 4. Request flow

1. Browser request Coolify Next.js API ko bhejta hai.
2. Coolify user login, plan, permissions aur credit balance verify karta hai; prompt/history prepare karta hai.
3. Coolify request body/path ko timestamp + nonce ke saath HMAC-SHA256 sign karta hai.
4. Cloudflare Worker signature/replay validate karta hai, per-user limit lagata hai aur inference request OpenRouter ko proxy karta hai.
5. Response Worker se Coolify aur phir browser tak stream hota hai.
6. Coolify actual provider token usage/cost save karta hai aur wallet credits settle karta hai.

Initial live route mein manually selected models OpenRouter se infer honge. Auto mode mein Groq key available ho to Worker suitable allowed candidate choose kar sakta hai; inference phir bhi OpenRouter se hoti hai. Manually selected model fail ho to app chupke se doosra model select nahi karti.

## 5. Verification checklist

- [ ] Worker name `ilmai-ai-router` aur Durable Objects deploy successfully.
- [ ] Worker secrets list mein `AI_ROUTER_SECRET`, `OPENROUTER_API_KEY`, `GROQ_API_KEY_1`–`GROQ_API_KEY_10` aur `GEMINI_API_KEY_1`–`GEMINI_API_KEY_10` configured hon.
- [ ] Coolify par `AI_ROUTER_URL`, matching `AI_ROUTER_SECRET` aur `OPENROUTER_API_KEY` configured hon.
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

OpenRouter catalogue fetch Coolify server se direct hota hai, lekin chat/image/video/quiz/suggestions/prompt-enhancer/presentation/test inference calls Cloudflare AI Router se guzarti hain. Next.js mein direct provider inference fallback add nahi karna.
