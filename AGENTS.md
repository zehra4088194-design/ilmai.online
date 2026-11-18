# AGENTS.md – instructions for AI coding assistants (ChatGPT / Codex / Claude Code)

Project: **Ilm AI** (ilmai.online) – multi-model AI chat for Pakistani students & teachers. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` first.

## Commands
- `npm run dev` · `npm run typecheck` (must pass) · `npm run build` (must pass before finishing a task)

## Hard rules
1. **Secrets stay server-side.** Never import `lib/supabase/admin.ts`, `lib/openrouter.ts`, `lib/storage/b2.ts`, `lib/env.ts` from a `'use client'` file. Never prefix secrets with `NEXT_PUBLIC_`.
2. **Every new API route**: `handle(...)` wrapper → `requireUserApi()` (or `requireAdminApi()`) → `requireFeature(key, plan, isAdmin)` → validate input with `zod`.
3. **Every paid action** (anything that calls OpenRouter): check credits → run → `creditsFor()` + `addCredits(-n)` → `logUsage()`. Admins are not charged.
4. **New feature = 5 steps**: (a) insert a row in `feature_flags` (new SQL migration, never edit 0001) (b) add the key to `FeatureKey` in `lib/features.ts` (c) API route under `app/api/generate/<name>` (d) user screen under `app/(app)/tools/[key]` + `FEATURE_HREF` in `components/icons.ts` (e) it is automatically controllable from `/admin/features`.
5. **DB changes** go in new files `supabase/migrations/000N_*.sql`. Keep RLS on. Users may only write their own rows; privileged writes use the service-role client in server code.
6. **Media** is always stored in Backblaze B2 through `lib/media.ts#saveMedia` (private bucket, signed URLs) and tracked in `media_assets`. Never store base64 in the DB.
7. **UI**: green design tokens live in `globals.css` (`--primary`, `--accent`, …). Use the Tailwind token colours (`bg-primary`, `text-muted-foreground`, …) and component classes (`btn-primary`, `card`, `glass`, `input`, `badge`). Support light + dark and RTL (`dir="auto"` on user text). Animate with Framer Motion, respect `prefers-reduced-motion`.
8. Do not add heavy dependencies without a reason. No `localStorage` for anything security-relevant.
9. Keep it deployable: output is a Next.js `standalone` Docker image (see `Dockerfile`).
