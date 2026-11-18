# Roadmap / hand-off notes

Done: see README table. Below is **what to build next**, in order, with enough detail to continue without asking.

## 0. Before anything else
- Apply `supabase/migrations/0001_init.sql`, set env vars, make yourself admin, open `/admin`.
- Verify image model id (`feature_flags.config.default_model`) against https://openrouter.ai/models?output_modalities=image .

## 1. Polish phase-1 chat
- Regenerate / edit-last-message, stop-and-keep partial, conversation export (PDF/Markdown).
- Replace `prompt()/confirm()` in the sidebar with proper modals.
- Per-message token/cost badge (data already in `messages.prompt_tokens/completion_tokens/cost_usd`).
- Rate limiting (Valkey/Upstash token bucket) in `/api/chat`; Cloudflare Turnstile on sign-up.
- Port the 10 theme families from the old `ilmAI` repo (`public/themes/*.css`, `lib/constants/themes.ts`) – currently there are 5 green accents + light/dark (`[data-accent]` in `globals.css`).

## 2. File & image upload + vision
- Flag `file_upload`. API `/api/media/upload-url` + `/api/media/[id]` already exist (browser PUTs straight to B2; **add the CORS rule from docs/SETUP.md**).
- UI: paperclip in `Composer` → upload → chip preview → send `attachments:[assetId]` with the message.
- In `/api/chat`: for each attachment generate a signed URL and send OpenAI-style content parts `{type:'image_url', image_url:{url}}` (for PDFs use OpenRouter's `file` content part / plugin). Only allow when `model.vision`.

## 3. Presentations export
- `/api/generate/presentation` already returns validated deck JSON (`Deck` zod schema).
- Add exporter: `pptxgenjs` → buffer → `saveMedia({kind:'pptx'})`; PDF via the same HTML slides rendered by the PDF worker (see §5). Port slide renderers/backgrounds from old repo `src/lib/presentation/*`.
- Return `{asset}`; show Download buttons in `PresentationTool`.

## 4. Video generation
- Check if OpenRouter lists video-output models; otherwise write a provider adapter (`lib/video/<provider>.ts`: `start(prompt) → jobId`, `poll(jobId)`), run as background job.
- `media_assets.status = 'pending' → 'ready'`; UI polls `/api/media/[id]`. Charge credits on completion; `logUsage({kind:'video'})`.

## 5. Teacher test maker (the big differentiator)
Tables `skills` and `test_jobs` exist; admin can already create skills at `/admin/skills`.
Pipeline: teacher picks **skill (template)** + uploads textbook page photos/PDF (B2) → vision model OCR (Urdu aware) → chapter text →
LLM call with `skill.instructions` + `skill.schema_json` (JSON mode) → zod-validate → inject into `skill.template_html` (Handlebars/EJS-style) →
**PDF worker** → upload PDF → `test_jobs.pdf_asset_id`.
- PDF worker = separate small service (Playwright + Chromium) because Chromium is too heavy for the Next container. Expose `POST /render {html}` → PDF, secured by a shared secret; call it from `/api/generate/test`.
- Fonts for PDFs: Noto Nastaliq Urdu (already a dependency), Plus Jakarta Sans. Urdu templates must set `dir="rtl"`.
- Run as background job (`test_jobs.status`: queued → ocr → generating → rendering → done/failed); UI polls.
- Teacher review screen (edit/regenerate/delete each question) before final PDF.
- Branding: PDFs should carry the Ilm AI watermark/links (copy the design from the old repo's `TestPaper`).

## 6. Web search, voice
- Web search: OpenRouter online variants (`:online` suffix / web plugin) behind flag `web_search`.
- Voice: browser MediaRecorder → transcription model → fill the composer.

## 7. Payments & plans
- Local gateways (Safepay / Easypaisa / JazzCash): checkout → webhook → set `profiles.plan` + `grant_credits`. Add a `payments` table.

## 8. Ops
- Error tracking (Sentry), PostHog analytics (events: signup, first_message, feature_used), Resend emails (welcome, low credits).
- Backups: Supabase PITR; B2 lifecycle rules for old generations.
