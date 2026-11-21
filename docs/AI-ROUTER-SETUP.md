# Cloudflare AI Router — deployment guide (Roman Urdu)

Ilm AI ka approved production design:

- **Coolify / Next.js:** login, user plans, credits wallet, conversation history, prompt preparation, database writes aur usage settlement.
- **Cloudflare Worker:** signed AI gateway, per-user rate limits, replay protection, routing aur provider response streaming.
- **OpenRouter:** live model catalogue + base token prices ka source; initial production setup mein primary inference gateway bhi.

Browser kabhi bhi OpenRouter, Groq ya Gemini ko direct call nahi karta. Provider keys sirf server-side secrets mein rehti hain.

## 1. Cloudflare Worker deploy karo

1. Cloudflare Dashboard → **Workers & Pages** → **Create Worker**.
2. Worker ka naam bilkul `ilmai-ai-router` rakho aur starter Hello World Worker ek baar deploy kar do. Ye initial Worker resource create karta hai, taa-ke Wrangler us par secrets attach kar sake.
3. Apne computer par repository clone/open karo aur terminal mein:
   ```bash
   cd workers/ai-router
   npm ci
   npm run typecheck
   npm test
   npx wrangler login
   ```
4. Ek naya random HMAC secret generate karo. Windows PowerShell mein:
   ```powershell
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $bytes = New-Object byte[] 32
   $rng.GetBytes($bytes)
   $rng.Dispose()
   ([BitConverter]::ToString($bytes)).Replace("-", "").ToLower()
   ```
   Is value ko secure password manager mein temporarily save kar lo. Chat ya GitHub par share nahi karna.
5. Wrangler ke interactive prompts se required secrets set karo:
   ```bash
   npx wrangler secret put AI_ROUTER_SECRET
   npx wrangler secret put OPENROUTER_API_KEY
   ```
   Dono secrets required hain. OpenRouter key wahi account key hogi jo model catalogue ke liye Coolify mein bhi set hogi.
6. Worker code deploy karo:
   ```bash
   npx wrangler deploy
   npx wrangler secret list
   ```
   Secret list sirf names/status dikhane ke liye use karo — secret values nahi.
7. Deploy output mein Worker ka actual URL milega. Aam tor par format:
   `https://ilmai-ai-router.<your-account-subdomain>.workers.dev`
   Apna real URL copy karo. Ye sample URL actual account domain nahi hai.

## 2. Optional provider keys

Initial setup ke liye Groq/Gemini API keys required nahi hain.

- `GROQ_API_KEY_1`: Auto mode ke smart model chooser ko Groq-powered selection deta hai. Is key ke baghair Auto deterministic candidate priority use karta hai.
- `GEMINI_API_KEY_1` aur additional numbered Groq/Gemini slots: sirf tab lagao jab future mein approved direct-provider routing enable karni ho.
- Har provider ke maximum 10 numbered slots supported hain; unconfigured slots ignore hote hain.

Keys add karne ke liye:
```bash
npx wrangler secret put GROQ_API_KEY_1
npx wrangler secret put GEMINI_API_KEY_1
```
Har secret add/update par Wrangler Worker ka naya version deploy karta hai.

## 3. Coolify main app variables

Coolify → main Ilm AI app → Environment Variables mein:

| Variable | Value kahan se aayegi |
|---|---|
| `AI_ROUTER_URL` | Wrangler deploy output ka Worker base URL; endpoint path add nahi karna |
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
- [ ] Worker secrets list mein `AI_ROUTER_SECRET` aur `OPENROUTER_API_KEY` configured hon.
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
