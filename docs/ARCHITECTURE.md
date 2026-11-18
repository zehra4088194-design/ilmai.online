# Architecture

```
src/
  app/
    page.tsx                      landing
    (auth)/login | signup         Supabase email+password / Google
    (app)/                        signed-in user app (layout = AppShell sidebar)
      chat/[[...id]]              ChatView (streaming)
      compare                     CompareView
      tools/[key]                 per-feature screens (image, presentations, placeholders)
      settings
    admin/                        admin panel (layout checks role)
      page (analytics) · features · models · users · usage · media · skills · settings
    api/
      chat                        streaming proxy → OpenRouter, saves messages, charges credits
      conversations[/id]          list / messages / rename / pin / delete (RLS client)
      models · features · me      data for the UI
      generate/{image,presentation,video,test}
      media/upload-url · media/[id]    B2 signed URLs
      admin/*                     admin mutations (requireAdminApi + revalidateTag)
      cron/daily-credits          Bearer CRON_SECRET
  components/ {chat, admin, tools, landing, ui}
  lib/
    auth.ts        getAuth / requireUserPage / requireAdminApi …
    features.ts    feature flags, per-user state, requireFeature()
    settings.ts    app_settings (cached, tag 'settings')
    models.ts      OpenRouter catalogue ⊕ model_settings overrides (tag 'models')
    openrouter.ts  fetch wrappers (stream + non-stream)
    credits.ts · usage.ts · media.ts · storage/b2.ts
    supabase/{client,server,admin}.ts
supabase/migrations/0001_init.sql
```

## Chat data flow
1. Browser `POST /api/chat {conversationId?, model, message}` (history is **loaded from the DB**, never trusted from the client).
2. Server: auth → maintenance → `requireFeature('text_chat')` → model enabled & tier ≤ plan → credits > 0.
3. Creates the conversation (first message), stores the user message, calls OpenRouter with `stream:true` + `usage.include`.
4. Streams plain text deltas to the browser; header `X-Conversation-Id` lets the client update the URL.
5. On finish (or abort): stores the assistant message, charges credits = `ceil(cost_usd × credits_per_usd)`, inserts a `usage_events` row.

## Feature flags
`enabled` / `visible` / `coming_soon` / `min_plan` → `stateFor()` returns `active | locked_plan | coming_soon | hidden`. Admins always get `active`.

## Credits
`profiles.credits_balance`, ledger in `credit_transactions`, atomic via SQL function `grant_credits`. New users get `default_credits`; `/api/cron/daily-credits` tops free users up to `daily_free_credits`.

## Security model
- RLS on every table. Browser (anon key) can read only its own rows and the public config tables; it can update only `full_name, avatar_url, preferred_model, language, last_seen_at` on `profiles` (column grants) – so nobody can make themselves admin or give themselves credits.
- All privileged work uses the service-role key **on the server only**.
- Admin = `profiles.role = 'admin'` or email in `ADMIN_EMAILS`.
- B2 bucket is private; users get short-lived signed URLs.
- Known gaps (see ROADMAP): per-IP rate limiting, abuse/captcha on sign-up, moderation.
