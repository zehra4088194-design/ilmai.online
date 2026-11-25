# Setup guide (Roman Urdu)

## 1. Supabase (naya account)
1. https://supabase.com → New project (region: Singapore/Mumbai, strong DB password save kar lo).
2. **SQL Editor → New query** → pehle `supabase/migrations/0001_init.sql` paste → **Run**. Phir naya query → `supabase/migrations/0002_modes_quiz_suggestions.sql` paste → **Run** (dono, isi tarteeb se).
3. **Project Settings → API**: copy karo
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**secret** – kahin share mat karna)
4. **Authentication → URL Configuration**: Site URL = `https://ilmai.online`, Redirect URLs mein `https://ilmai.online/auth/callback` (aur local ke liye `http://localhost:3000/auth/callback`).
5. (Optional) **Authentication → Providers → Google** enable karo. Testing ke liye email confirmation band rakhna chaho to **Providers → Email → Confirm email** off kar do.
6. Pehla account app se sign-up karo, phir SQL editor mein: `update public.profiles set role='admin' where email='TUMHARI-EMAIL';`
   (ya Coolify mein `ADMIN_EMAILS=ilmai.store2@gmail.com` set kar do).

## Email and contact addresses

- Owner/admin login: `ilmai.store2@gmail.com` (`ADMIN_EMAILS`). Use this address when creating the first administrator account.
- General support and privacy requests: `contact@ilmai.online` (`SUPPORT_EMAIL`, `PRIVACY_CONTACT_EMAIL`).
- Product feedback and suggestions: `feedback@ilmai.online` (`FEEDBACK_EMAIL`).
- Transactional sender: `Ilm AI <contact@ilmai.online>` (`EMAIL_FROM`). Verify the `ilmai.online` sending domain in Resend and publish its required SPF/DKIM DNS records before expecting delivery. The two domain addresses must exist as mailboxes or forwarding aliases if they are to receive replies.

## 2. Cloudflare Turnstile + Supabase Auth (security)

1. Cloudflare dashboard → **Turnstile** → widget **Ilm AI - Supabase Auth**. Widget mode **Managed**; allowed domains: `ilmai.online`, `localhost`, `127.0.0.1`. (The production website hostname is `ilmai.online` only.)
2. Coolify main app environment:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = widget **Sitekey** (public; mark as a Build Variable too).
   - `TURNSTILE_SECRET` = widget **Secret key** (server-only; never use `NEXT_PUBLIC_*`).
   - `TURNSTILE_HOSTNAMES=ilmai.online` in production. For local development, use `localhost,127.0.0.1` in your local `.env.local`.
3. Supabase dashboard → **Authentication → Settings → Bot and Abuse Protection → Enable CAPTCHA protection**. Select **Cloudflare Turnstile**, paste the same widget Secret key, and save.
4. Redeploy the app after adding the Coolify variables. Keep Supabase CAPTCHA disabled until both the public sitekey is present in the deployed app and the secret is saved in Supabase; otherwise sign-in, sign-up and password reset requests can be rejected.
5. The app sends `captchaToken` to Supabase for email/password sign-up, email/password sign-in and password-reset requests. Google OAuth is checked server-side against Cloudflare Siteverify before the OAuth redirect because Supabase's `signInWithOAuth` client method does not expose a `captchaToken` option.
6. Test all four paths on `https://ilmai.online` and, separately, on localhost during development. Tokens expire and are single-use; the widget resets after each attempt.

## 3. OpenRouter
https://openrouter.ai/keys → key banao → `OPENROUTER_API_KEY`. Credits add karo. Settings → "Limits" mein monthly spend limit zaroor lagao.

### Free models (suggestions + quiz)
Suggestions aur quizzes **free models** se chalte hain (user ke credits nahi katte). Dhyan rakho:
- Agar free model par "no endpoints / data policy" jaisa error aaye to OpenRouter → **Settings → Privacy** mein free models allow karo.
- Free models par rate limit / daily limit hoti hai (OpenRouter docs mein current limits dekho; credits add karne se limit barh sakti hai) aur ye limit **tumhare saare users mein share** hoti hai. Isliye app mein per-user daily caps hain (`/admin/settings`).
- Free models aate-jate rehte hain. App automatically live catalogue se best free models chunti hai aur ek fail ho to agla try karti hai. Chaho to `/admin/settings → Free models` mein apni list pin kar do (comma separated).

## 4. Cloudflare AI Router (required for all AI inference)
1. Worker `ilmai-ai-router` is deployed at `https://ilmai-ai-router.ilmai.workers.dev`; its `RequestGate` and `KeyPool` SQLite Durable Objects are provisioned.
2. Cloudflare Worker secrets: `AI_ROUTER_SECRET` is already configured. **`OPENROUTER_API_KEY` is still required**: add the same OpenRouter key used in Coolify as a Worker Secret.
3. In Coolify, set `AI_ROUTER_URL=https://ilmai-ai-router.ilmai.workers.dev`, set `AI_ROUTER_SECRET` to the exact same value as the Worker's secret, and keep `OPENROUTER_API_KEY` for model catalogue/pricing discovery. Redeploy the main app after adding variables.
4. Optional Cloudflare Worker secrets: `GROQ_API_KEY_1` ... `GROQ_API_KEY_10` and `GEMINI_API_KEY_1` ... `GEMINI_API_KEY_10`. Groq keys are reserved for prompt enhancement, generating a new chat title from its first prompt, and summaries of multi-model comparisons. Suggestions and normal chat inference use OpenRouter; Auto chooses a suitable OpenRouter candidate deterministically. Gemini keys are used for chat-image understanding, not as general text-chat models.
5. Never put provider keys or router secrets in browser-side `NEXT_PUBLIC_*` variables. Full deployment notes: `docs/AI-ROUTER-SETUP.md`.

## 5. Backblaze B2
1. Buckets → Create bucket `ilmai-media`, **Private**.
2. App Keys → Add key (sirf us bucket ke liye, Read & Write) → `keyID` = `B2_KEY_ID`, `applicationKey` = `B2_APPLICATION_KEY` (sirf ek baar dikhti hai).
3. Bucket detail mein **Endpoint** dikhega (e.g. `s3.us-west-004.backblazeb2.com`) → `B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com`, `B2_REGION=us-west-004`.
4. Browser se direct upload (file upload feature) ke liye CORS: Bucket Settings → CORS Rules → "custom" → operations `s3_put, s3_get, s3_head`, allowed headers `*`, aur allowed origin sirf `https://ilmai.online` rakho. Origin mein trailing slash mat lagana; purane `.store` aur `www` origins remove kar do.

## 6. Local chalana
```bash
cp .env.example .env.local   # values bharo
npm install && npm run dev
```

## 7. Coolify pe deploy (purane app ko delete kiye baghair)
1. Purana `ilm-ai-production` **Stop** (Delete nahi) – RAM free ho jayegi. Auto Deploy band rakho.
2. Coolify → **New Resource → Public/Private Repository** → `https://github.com/zehra4088194-design/ilmai.online`, branch `main`.
3. **Build Pack = Dockerfile**, **Port = 3000**.
4. Domain attach karte waqt apna production domain configure karo; DNS record ko apne Coolify server par point karo.
5. **Environment Variables**: `.env.example` ki values daalo. `NEXT_PUBLIC_*` wali values ko **Build Variable** bhi tick karo.
   - `EXCHANGE_RATE_API_KEY` ko server-side runtime secret ke taur par add karo. Ye old ilmAI app ka existing ExchangeRate-API key reuse kar sakta hai; agar available na ho to ExchangeRate-API ka Free plan key banao. Isay `NEXT_PUBLIC_*` ya Build Variable mat banana.
6. Deploy. Health check: `/api/health`.

### Daily free credits cron (required)
1. PowerShell mein 32-byte random secret generate karo:
   ```powershell
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $bytes = New-Object byte[] 32
   $rng.GetBytes($bytes)
   $rng.Dispose()
   ([BitConverter]::ToString($bytes)).Replace("-", "").ToLower()
   ```
2. Is value ko Coolify main app ke `CRON_SECRET` environment variable mein save karo aur app redeploy karo. Secret ko kisi aur ke saath share mat karo.
3. Main app → **Scheduled Tasks** → **Add**:
   - Name: `Daily free credits`
   - Command (Run in shell ON):
     ```bash
     node -e "fetch('http://127.0.0.1:3000/api/cron/daily-credits',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>{const t=await r.text();console.log(r.status,t);if(!r.ok)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})"
     ```
   - Frequency: run shortly after **00:00 UTC** each day. Check the Coolify server timezone with `date` in the app container: use `5 0 * * *` when its timezone is UTC; use `5 5 * * *` when its timezone is Asia/Karachi (PKT).
   - Timeout: `60` seconds; leave Container empty for the single main app container.
4. Click **Execute Now** once and inspect Scheduled Tasks → Executions. It should return HTTP 200 with JSON containing `topped_up`. A 401 means `CRON_SECRET` is missing or mismatched.
5. This endpoint is UTC-day idempotent, so run it once daily. Coolify evaluates task schedules in the deployment server's configured timezone. The same daily call also refreshes the saved USD/PKR rate from ExchangeRate-API; its JSON response includes an `exchangeRate` status. If it says `not_configured`, add `EXCHANGE_RATE_API_KEY`; if it says `fallback`, the previous saved rate is kept and the free-credit top-up still completes.
6. To refresh manually, open Admin → Plans & discounts → USD / PKR reference rate → **Refresh rate now**. Choose **Automatic daily rate** for the scheduled updates, or **Manual rate** to keep an admin-entered amount while still recording fetched reference rates.

## 8. Test Studio PDF renderer (required for PDF downloads)
1. Coolify mein isi repository ka doosra resource banao.
2. Build context repository root rakho; Dockerfile path `workers/pdf-renderer/Dockerfile`; internal port `3400`.
3. PDF service par `PDF_RENDERER_SECRET` ko 32+ random bytes ka secret set karo. `/render` ko public domain par expose mat karna.
4. Next.js app par `PDF_RENDERER_URL=http://<internal-service-name>:3400` aur bilkul wahi `PDF_RENDERER_SECRET` set karo.
5. Dono services ko private Coolify Docker network mein rakho. Pehle PDF service healthy karo, phir Next.js app redeploy karo.
6. Test Studio `/test-studio` par khulta hai. Pehle test ko topic ya verified textbook source se generate karo. Question Paper PDF sirf questions rakhta hai; Answer Key aur Teacher Copy ko current answer key chahiye.
7. English, Urdu aur mixed-language exports ko visually check karo. Urdu rendering Noto Nastaliq fonts par depend karti hai.

## 9. Purana app dobara chalana
Naye app ko stop/limit karo (ya domain alag rakho), phir purane resource par **Start**. Pehli baar rebuild hoga to naya app band rakho (RAM).

## Checklist
- [ ] SQL run · [ ] admin banaya · [ ] `/admin/models` mein models check · [ ] `/admin/features` mein jo features dikhane hain on kiye
- [ ] OpenRouter spend limit · [ ] B2 bucket private · [ ] `.env` kabhi git mein commit nahi
