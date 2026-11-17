# Ilm AI — Learning & Creative Workspace

A light, modern AI workspace for students and teachers. It combines multi-model chat, interactive quizzes, and a prompt library for presentations, videos, and visual assets.

## Included in this starter

- Student / Teacher workspace switch.
- Responsive workspace shell with animated micro-interactions.
- OpenRouter model catalogue loaded dynamically at runtime (free models appear first, followed by low-cost models).
- Server-side OpenRouter chat proxy. The API key is never sent to the browser.
- Interactive five-question quiz generation from the active conversation.
- Prompt library with ready-to-use prompts for presentations, video scripts, posters, infographics, worksheets, and thumbnails.
- Each template has a separate **cover-art prompt**. Use it to generate the actual background image, then replace the CSS artwork placeholder with your image.
- Token usage display when the provider returns usage metadata.
- Server-calculated estimated billable API cost using a configurable default 25% markup, when OpenRouter returns provider cost metadata.
- No mock AI answers: the chat clearly reports when the API key has not been configured.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local`.
3. Add your OpenRouter API key to `OPENROUTER_API_KEY`.
4. Run:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment

- `OPENROUTER_API_KEY` — required; server-side only.
- `NEXT_PUBLIC_SITE_URL` — optional; used for OpenRouter request attribution.
- `ILM_MARKUP_PERCENT` — optional; defaults to `25` and is applied to provider-reported API cost for the displayed estimate.

Never add the OpenRouter key to a `NEXT_PUBLIC_*` variable, commit a real `.env.local`, or expose provider secrets in client components.

## Deployment

This is a standalone Next.js app and can be deployed to Coolify, another Node host, or Vercel. For the Oracle VM / Coolify setup, use a separate application/resource and domain for ilmai.online. Do not attach it to or redeploy the existing ilmai.study service.

Set `OPENROUTER_API_KEY` and `NEXT_PUBLIC_SITE_URL` in the new app's server environment. Build with `npm run build` and start with `npm run start` (the Docker standalone output can also be used).

## What still needs production credentials / integration

This repository starts with a functional AI workspace, not a pretend fully provisioned SaaS backend. Before public launch, connect a **new, separate Supabase project** for authentication, user profiles, role permissions, conversation persistence, quiz history, prompt library favourites, usage events, and credit wallets. Add server-side rate limiting, per-user quotas, verified model-cost accounting, payment subscriptions, and admin controls before accepting paid users.

The planned 25% markup is configurable through `ILM_MARKUP_PERCENT` and is used only to display a projected billable API cost when OpenRouter returns usage cost metadata. This is not yet a wallet debit or realised profit. The per-credit USD conversion, persistent wallet deduction, monthly allowance, payment fees, taxes, and payment subscriptions must be finalised and implemented with the separate Supabase backend before charging users. Do not use a hard-coded per-message fee. Provider-reported cost and token counts are displayed only when returned by the provider.

## Template artwork workflow

In `src/lib/templates.ts`, every template includes:
- `starterPrompt`: the prompt copied into the chat composer.
- `coverPrompt`: a separate prompt for generating the template card's cover/background image.

Generate the cover art with the matching aspect ratio, then replace the corresponding `template-art` CSS illustration in `src/app/page.tsx` with an image asset. Keep the original `coverPrompt` as the asset-generation reference.

## Stack

Next.js App Router · React · TypeScript · OpenRouter · Lucide icons · custom responsive CSS
