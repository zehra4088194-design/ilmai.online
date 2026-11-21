# Ilm AI · ilmai.online

Every AI model, one beautiful place – built for students and teachers (English · اردو · Roman Urdu).

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind 3 · Framer Motion · Supabase (Auth + Postgres + RLS) · Cloudflare Workers (signed AI gateway) · OpenRouter (model catalogue + primary inference gateway) · Backblaze B2 (S3 API) · Docker → Coolify.

## What exists today
| Area | Status |
|---|---|
| **Multi-model chat (AI-Fiesta style)** – pick 1-4 models, answers stream side by side, each model keeps its own thread; saved history | ✅ |
| **Student / Teacher modes** in the sidebar (like GPTs/plugins): Study Buddy, Homework Helper, Quiz Me, Exam Prep, Writing Coach, Language Tutor · Lesson Planner, Quiz & Test Builder, Worksheet Maker, Grading Assistant, Parent Notices, Classroom Ideas. Each = hidden prompt + starters + optional tool. Editable in `/admin/modes` | ✅ |
| **Quiz engine** – generate MCQ / true-false quizzes (free models), interactive card in chat, instant feedback, score, review, retry wrong, "explain my mistakes", saved attempts | ✅ |
| **Smart suggestions** – 3 "ask next" chips after every answer + "Quiz me on this" (free models, costs no credits, daily cap) | ✅ |
| Streaming, markdown/code copy, Urdu RTL, live OpenRouter model catalogue, free/pro/elite tiers | ✅ |
| Credits wallet (per-message cost from real provider usage) + daily free top-up cron | ✅ |
| **Admin panel** – analytics (+ learning stats), feature switches, models, study modes, users/credits, usage log, media (B2), teacher skills, settings | ✅ |
| Image generation (OpenRouter → B2) | ✅ API+UI (verify model id) |
| Presentations: topic → slide JSON | ✅ · PPTX/PDF export ⏳ |
| Video generation, Teacher test maker (photos → PDF), file upload UI, web search, voice | ⏳ scaffolded – see `docs/ROADMAP.md` |

## Feature switches
Every feature is a row in `feature_flags`; **/admin/features** controls `enabled` (API works) · `visible` (shown) · `coming_soon` (locked) · `min_plan`. Admins can always use everything. Server routes call `requireFeature(key, …)`.

## Run locally
```bash
cp .env.example .env.local      # see docs/SETUP.md
npm install && npm run dev      # http://localhost:3000
```
Database: run **both** `supabase/migrations/0001_init.sql` and `0002_modes_quiz_suggestions.sql` (in order) in the Supabase SQL editor.

## Docs
`docs/SETUP.md` (Roman Urdu, step by step) · `docs/AI-ROUTER-SETUP.md` (Cloudflare Worker deployment + Coolify variables) · `docs/ARCHITECTURE.md` · `docs/ROADMAP.md` · `AGENTS.md` (rules for AI assistants)
