# Architecture

```
src/
  app/
    page.tsx                         landing
    (auth)/login | signup
    (app)/                           signed-in app, layout = AppShell (sidebar)
      chat/[[...id]]                 ChatView  (?mode=<slug> starts a chat in a study mode)
      tools/[key]                    image, presentations, placeholders
      settings                       name, Student/Teacher, class level, theme
    admin/                           overview · features · models · modes · users · usage · media · skills · settings
    api/
      chat                           ONE model answers ONE stored user message (streamed)
      conversations[/id[/messages]]  create (with first message) / load / rename / pin / delete / add message
      suggest                        3 follow-up ideas (free models)
      quiz/generate · quiz/[id] · quiz/[id]/attempt
      models · features · me
      generate/{image,presentation,video,test}   media/{upload-url,[id]}
      admin/*   cron/daily-credits
  components/ {chat, quiz, admin, tools, landing, ui}
  lib/
    auth · features · settings · modes · models · ai-router · openrouter (catalogue only) · credits · usage · media · storage/b2
    prompt.ts       system prompt = global prompt + active mode + user context (student/teacher, grade)
    history.ts      pure fn: rows → messages for one model (multi-model aware)  [unit-tested]
    utility-ai.ts   "free model" helper with fall-through chain (suggestions, quizzes)
    quiz.ts · json-extract.ts   quiz prompt + strict validation/normalisation of LLM JSON [unit-tested]
supabase/migrations/0001_init.sql  0002_modes_quiz_suggestions.sql
```

## Multi-model chat flow (AI-Fiesta style)
1. Browser stores the user message first: `POST /api/conversations {firstMessage, mode}` (new chat) or `POST /api/conversations/:id/messages`. → `userMessageId`.
2. Browser calls `POST /api/chat {conversationId, userMessageId, model, multi}` **once per selected model, in parallel**. Each response streams into its own column.
3. Coolify server: auth → maintenance → feature flags (`text_chat`, + `compare_models` if multi) → model enabled & tier ≤ plan → credits > 0 → loads history *before* that message with `buildHistory()` (each model sees its own earlier answers) → system prompt via `buildSystemPrompt()`.
4. Coolify signs the request with HMAC-SHA256 and sends it to the Cloudflare AI Router. The Worker verifies timestamp/nonce/signature, applies per-user rate limits, then proxies the selected model to OpenRouter. Auto mode may use its configured Groq key for model selection; inference remains OpenRouter unless a server-approved candidate explicitly names another provider. No silent model substitution is made for a manually selected model.
5. The stream returns through Worker → Coolify → browser. On finish, Coolify saves the assistant message with `meta.turn = userMessageId`, charges credits from OpenRouter-reported actual cost (`ceil(cost_usd × credits_per_usd)`), and logs `usage_events`.
5. UI groups messages into turns (`groupMessages`): 1 answer = normal chat, >1 = columns (swipe on mobile).

## Modes (Student / Teacher "plugins")
Table `modes` (slug, audience, name, name_ur, icon, description, **system_prompt**, starters[], tool, is_active). Sidebar shows modes for the user's `profiles.audience` (toggle at top). `conversations.mode` remembers the mode; the chat route injects its prompt. `tool = 'quiz'` shows the quiz builder on the start screen. Add/edit in `/admin/modes`.

## Quiz engine
`POST /api/quiz/generate` → `utilityChat()` (free models, retry on a different model) → `parseQuiz()` (drops invalid/duplicate questions, shuffles options and re-points the answer) → rows in `quizzes` + an assistant message with `meta = {kind:'quiz', quiz_id}`. `QuizCard` renders it; `POST /api/quiz/:id/attempt` scores **on the server** from the stored key and saves to `quiz_attempts`. Caps: `quizzes_per_day`, `quiz_max_questions`.

## Free-model "utility" calls
Suggestions and quizzes use free OpenRouter models (auto-picked from the live catalogue, preference order in `utility-ai.ts`, or pinned via setting `utility_models`). Every call falls through to the next model on error/rate-limit. They cost the user no credits; per-user daily caps protect the shared free quota. If a free model errors, the UI simply shows no suggestions.

## Security model
RLS on every table; the browser can only update `full_name, avatar_url, preferred_model, language, last_seen_at, audience, grade` on `profiles` (column grants). All privileged work uses the service-role key on the server. Admin = `profiles.role='admin'` or `ADMIN_EMAILS`. B2 bucket private + signed URLs. Quiz scores computed server-side.
Known gaps: per-IP rate limiting, sign-up abuse protection, moderation, KaTeX maths rendering.


## Runtime responsibility split

- **Coolify / Next.js:** user authentication, plan and feature checks, wallet reservations/deductions, conversation history, prompts, database writes and usage logs.
- **Cloudflare AI Router Worker:** the only inference gateway for chat, utility AI (suggestions/quizzes/prompt enhancement), image/video requests, presentations and test generation. It verifies signed HMAC requests, rate-limits by user, routes and streams provider responses.
- **OpenRouter:** source of the live model catalogue and per-token base prices (fetched server-side by Coolify), and the primary inference gateway called by the Worker. The OpenRouter key is therefore configured twice: in Coolify for catalogue access and as a Worker secret for inference.
- **Supabase:** Auth and Postgres data store; it is not a model inference proxy.

The app must fail closed when `AI_ROUTER_URL` or `AI_ROUTER_SECRET` is absent. Do not add a direct provider inference fallback in Next.js; keep all provider credentials server-side and keep inference behind the Worker. See [AI Router deployment](AI-ROUTER-SETUP.md).
