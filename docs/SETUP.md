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
   (ya `ADMIN_EMAILS` env mein email daal do).

## 2. OpenRouter
https://openrouter.ai/keys → key banao → `OPENROUTER_API_KEY`. Credits add karo. Settings → "Limits" mein monthly spend limit zaroor lagao.

### Free models (suggestions + quiz)
Suggestions aur quizzes **free models** se chalte hain (user ke credits nahi katte). Dhyan rakho:
- Agar free model par "no endpoints / data policy" jaisa error aaye to OpenRouter → **Settings → Privacy** mein free models allow karo.
- Free models par rate limit / daily limit hoti hai (OpenRouter docs mein current limits dekho; credits add karne se limit barh sakti hai) aur ye limit **tumhare saare users mein share** hoti hai. Isliye app mein per-user daily caps hain (`/admin/settings`).
- Free models aate-jate rehte hain. App automatically live catalogue se best free models chunti hai aur ek fail ho to agla try karti hai. Chaho to `/admin/settings → Free models` mein apni list pin kar do (comma separated).

## 3. Backblaze B2
1. Buckets → Create bucket `ilmai-media`, **Private**.
2. App Keys → Add key (sirf us bucket ke liye, Read & Write) → `keyID` = `B2_KEY_ID`, `applicationKey` = `B2_APPLICATION_KEY` (sirf ek baar dikhti hai).
3. Bucket detail mein **Endpoint** dikhega (e.g. `s3.us-west-004.backblazeb2.com`) → `B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com`, `B2_REGION=us-west-004`.
4. Browser se direct upload (file upload feature) ke liye CORS: Bucket Settings → CORS Rules → "custom" → `s3_put, s3_get, s3_head`, origin `https://ilmai.online`, headers `*`.

## 4. Local chalana
```bash
cp .env.example .env.local   # values bharo
npm install && npm run dev
```

## 5. Coolify pe deploy (purane app ko delete kiye baghair)
1. Purana `ilm-ai-production` **Stop** (Delete nahi) – RAM free ho jayegi. Auto Deploy band rakho.
2. Coolify → **New Resource → Public/Private Repository** → `https://github.com/zehra4088194-design/ilmai.online`, branch `main`.
3. **Build Pack = Dockerfile**, **Port = 3000**.
4. **Domains**: `https://ilmai.online` (ya koi subdomain jab tak purana app band hai; DNS A record → VM IP `217.142.188.213`).
5. **Environment Variables**: `.env.example` ki saari values daalo. `NEXT_PUBLIC_*` wali ko **Build Variable** bhi tick karo (build ke waqt chahiye).
6. **Advanced → Resource limits**: memory ~1 GB, CPU 1 (VM chhoti hai).
7. Deploy. Health check: `/api/health`.
8. **Daily free credits**: Coolify → app → **Scheduled Tasks** → har roz:
   `wget -qO- --header="Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-credits`
   (ya koi bhi external cron jo `https://ilmai.online/api/cron/daily-credits` ko Bearer header ke saath call kare).

## 6. Purana app dobara chalana
Naye app ko stop/limit karo (ya domain alag rakho), phir purane resource par **Start**. Pehli baar rebuild hoga to naya app band rakho (RAM).

## Checklist
- [ ] SQL run · [ ] admin banaya · [ ] `/admin/models` mein models check · [ ] `/admin/features` mein jo features dikhane hain on kiye
- [ ] OpenRouter spend limit · [ ] B2 bucket private · [ ] `.env` kabhi git mein commit nahi
