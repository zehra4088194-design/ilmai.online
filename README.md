# Ilm AI · ilmai.online

Every AI model, one beautiful place – built for students and teachers (English · اردو · Roman Urdu).

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind 3 · Framer Motion · Supabase (Auth + Postgres + RLS) · OpenRouter (one key, all models) · Backblaze B2 (S3 API) for media · Docker → Coolify.

## What exists today
| Area | Status |
|---|---|
| Text chat – streaming, history, markdown/code, Urdu RTL, model picker (live OpenRouter catalogue) | ✅ working |
| Compare mode – one prompt to up to 3 models in parallel | ✅ working |
| Credits wallet (per-message charge from real provider cost), daily free top-up cron | ✅ working |
| Admin panel – analytics, feature switches, model control, users/credits, usage log, media, teacher skills, settings | ✅ working |
| Image generation (OpenRouter → B2 → signed URL) | ✅ API + UI (verify the model id) |
| Presentation outline (topic → validated slide JSON) | ✅ API + UI · PPTX/PDF export ⏳ |
| Video generation, Teacher test maker, file upload UI, web search, voice | ⏳ scaffolded (flag + API stub + DB tables) – see `docs/ROADMAP.md` |

## Feature switches (the key idea)
Every feature is a row in `feature_flags`. In **/admin/features** the admin controls, per feature:
`enabled` (API works) · `visible` (shown to users) · `coming_soon` (shown but locked) · `min_plan`.
Admins can always use everything (to test before launch). All APIs call `requireFeature(key, …)`.

## Run locally
```bash
cp .env.example .env.local      # fill it in (see docs/SETUP.md)
npm install
npm run dev                     # http://localhost:3000
```
Database: run `supabase/migrations/0001_init.sql` in the Supabase SQL editor.

## Docs
- `docs/SETUP.md` – Supabase / OpenRouter / Backblaze / Coolify step by step (Roman Urdu)
- `docs/ARCHITECTURE.md` – folders, data flow, security rules
- `docs/ROADMAP.md` – what to build next, with exact instructions
- `AGENTS.md` – rules for AI coding assistants continuing this repo
