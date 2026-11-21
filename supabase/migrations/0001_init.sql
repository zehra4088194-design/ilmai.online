-- =====================================================================
-- Ilm AI (ilmai.online) – initial schema
-- Run in Supabase: SQL Editor -> paste -> Run   (or `supabase db push`)
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- app settings (key/value, editable from /admin/settings) ----------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('site_name',            '"Ilm AI"'),
  ('signups_enabled',      'true'),
  ('maintenance_mode',     'false'),
  ('announcement',         '{"enabled": false, "text": ""}'),
  ('default_credits',      '500'),      -- credits given on signup
  ('daily_free_credits',   '100'),      -- free plan top-up target (cron)
  ('credits_per_usd',      '10000'),    -- 1 credit = $0.0001 of provider cost
  ('min_credits_per_msg',  '1'),
  ('max_history_messages', '30'),
  ('max_upload_mb',        '15'),
  ('system_prompt',        '"You are Ilm AI, a helpful, accurate and friendly assistant for students and teachers. Reply in the same language the user writes in (English, Urdu or Roman Urdu). Be clear and concise."')
on conflict (key) do nothing;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  plan text not null default 'free' check (plan in ('free','pro','elite')),
  credits_balance bigint not null default 0,
  is_banned boolean not null default false,
  preferred_model text,
  language text not null default 'en',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare start_credits bigint;
begin
  select coalesce((value #>> '{}')::bigint, 500) into start_credits from app_settings where key = 'default_credits';
  insert into profiles (id, email, full_name, avatar_url, credits_balance)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(start_credits, 500))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- conversations & messages ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat',
  model text,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  model text,
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(12,6),
  attachments jsonb not null default '[]',   -- [{asset_id, kind}]
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- ---------- feature flags (controlled from /admin/features) ----------
-- enabled     : the feature's API works for normal users
-- visible     : the feature is shown in the user's UI
-- coming_soon : shown but locked with a "Coming soon" badge
-- min_plan    : free | pro | elite
-- Admins can always use every feature (for testing).
create table if not exists public.feature_flags (
  key text primary key,
  label text not null,
  description text not null default '',
  icon text not null default 'sparkles',
  enabled boolean not null default false,
  visible boolean not null default false,
  coming_soon boolean not null default false,
  min_plan text not null default 'free' check (min_plan in ('free','pro','elite')),
  sort_order int not null default 100,
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, label, description, icon, enabled, visible, coming_soon, min_plan, sort_order) values
  ('text_chat',        'AI Chat',            'Text-to-text chat with every OpenRouter model', 'message-square', true,  true,  false, 'free', 10),
  ('compare_models',   'Compare models',     'Ask one prompt to 2-3 models side by side',      'columns',        true,  true,  false, 'free', 20),
  ('image_generation', 'Image generation',   'Create images from text prompts',                'image',          false, false, true,  'pro',  30),
  ('video_generation', 'Video generation',   'Create short videos from text prompts',          'video',          false, false, true,  'pro',  40),
  ('presentations',    'Presentations',      'Generate slide decks (PPTX / PDF)',              'presentation',   false, false, true,  'free', 50),
  ('teacher_tests',    'Teacher test maker', 'Build test papers from textbook pages + templates (PDF)', 'file-text', false, false, true, 'free', 60),
  ('file_upload',      'File & image upload','Attach images / PDFs to chats',                  'paperclip',      false, false, true,  'free', 70),
  ('web_search',       'Web search',         'Let the AI search the web',                      'globe',          false, false, true,  'pro',  80),
  ('voice_input',      'Voice input',        'Talk to the AI',                                 'mic',            false, false, true,  'free', 90)
on conflict (key) do nothing;

-- ---------- model settings (controlled from /admin/models) ----------
create table if not exists public.model_settings (
  model_id text primary key,            -- OpenRouter id, e.g. "openai/gpt-4o-mini"
  enabled boolean not null default true,
  display_name text,
  tier text not null default 'free' check (tier in ('free','pro','elite')),
  is_default boolean not null default false,
  sort_order int not null default 1000,
  notes text,
  updated_at timestamptz not null default now()
);

-- ---------- usage & billing ----------
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'chat',    -- chat | compare | image | video | presentation | test
  model text,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  credits_used bigint not null default 0,
  latency_ms int,
  status text not null default 'ok',    -- ok | error
  error text,
  created_at timestamptz not null default now()
);
create index if not exists usage_created_idx on public.usage_events (created_at desc);
create index if not exists usage_user_idx on public.usage_events (user_id, created_at desc);

create table if not exists public.credit_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta bigint not null,
  balance_after bigint,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);

-- ---------- media stored in Backblaze B2 ----------
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('image','video','audio','pdf','pptx','docx','file')),
  storage_key text not null unique,     -- object key inside the B2 bucket
  mime text,
  size_bytes bigint,
  prompt text,
  model text,
  status text not null default 'ready', -- pending | ready | failed
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists media_user_idx on public.media_assets (user_id, created_at desc);

-- ---------- teacher skills / templates ----------
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  subject text,
  preview_url text,
  instructions text not null default '',   -- skill.md : hidden instructions sent to the AI
  schema_json jsonb not null default '{}', -- strict output schema
  template_html text not null default '',  -- HTML template rendered to PDF
  is_active boolean not null default true,
  version int not null default 1,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null,
  status text not null default 'queued',  -- queued | ocr | generating | rendering | done | failed
  options jsonb not null default '{}',
  source_asset_ids uuid[] not null default '{}',
  extracted_text text,
  result_json jsonb,
  pdf_asset_id uuid references public.media_assets(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.app_settings        enable row level security;
alter table public.profiles            enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.feature_flags       enable row level security;
alter table public.model_settings      enable row level security;
alter table public.usage_events        enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.media_assets        enable row level security;
alter table public.skills              enable row level security;
alter table public.test_jobs           enable row level security;

-- public / shared read-only config
create policy "settings readable"  on public.app_settings   for select using (true);
create policy "flags readable"     on public.feature_flags  for select using (true);
create policy "models readable"    on public.model_settings for select using (auth.uid() is not null);
create policy "skills readable"    on public.skills         for select using (is_active and auth.uid() is not null);

-- profiles: read own; update only safe columns (see grants below)
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke update on public.profiles from authenticated, anon;
grant  update (full_name, avatar_url, preferred_model, language, last_seen_at) on public.profiles to authenticated;

-- conversations & messages: owner only
create policy "own conversations" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own messages"      on public.messages      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- usage / credits / media / test jobs: owner can read; writes happen server-side (service role)
create policy "own usage"   on public.usage_events        for select using (auth.uid() = user_id);
create policy "own credits" on public.credit_transactions for select using (auth.uid() = user_id);
create policy "own media"   on public.media_assets        for select using (auth.uid() = user_id);
create policy "own tests"   on public.test_jobs           for select using (auth.uid() = user_id);

-- =====================================================================
-- Functions (service role only)
-- =====================================================================
create or replace function public.grant_credits(p_user uuid, p_amount bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_bal bigint;
begin
  update profiles set credits_balance = greatest(0, credits_balance + p_amount)
   where id = p_user returning credits_balance into new_bal;
  insert into credit_transactions (user_id, delta, balance_after, reason) values (p_user, p_amount, new_bal, p_reason);
  return new_bal;
end $$;

create or replace function public.grant_daily_credits() returns int
language plpgsql security definer set search_path = public as $$
declare target bigint; n int;
begin
  select coalesce((value #>> '{}')::bigint, 100) into target from app_settings where key = 'daily_free_credits';
  with up as (
    update profiles set credits_balance = target
     where plan = 'free' and not is_banned and credits_balance < target
    returning id, credits_balance
  )
  insert into credit_transactions (user_id, delta, balance_after, reason)
  select id, 0, credits_balance, 'daily_free_topup' from up;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.admin_overview(p_days int default 30) returns jsonb
language sql security definer set search_path = public stable as $$
  with p as (select now() - make_interval(days => p_days) as since)
  select jsonb_build_object(
    'users_total',          (select count(*) from profiles),
    'users_new',            (select count(*) from profiles, p where created_at >= p.since),
    'users_active_today',   (select count(distinct user_id) from usage_events where created_at >= date_trunc('day', now())),
    'users_active_period',  (select count(distinct user_id) from usage_events, p where created_at >= p.since),
    'conversations_total',  (select count(*) from conversations),
    'messages_total',       (select count(*) from messages),
    'requests_period',      (select count(*) from usage_events, p where created_at >= p.since),
    'errors_period',        (select count(*) from usage_events, p where created_at >= p.since and status = 'error'),
    'tokens_period',        (select coalesce(sum(prompt_tokens + completion_tokens), 0) from usage_events, p where created_at >= p.since),
    'cost_period',          (select coalesce(sum(cost_usd), 0) from usage_events, p where created_at >= p.since),
    'credits_period',       (select coalesce(sum(credits_used), 0) from usage_events, p where created_at >= p.since),
    'avg_latency_ms',       (select coalesce(round(avg(latency_ms)), 0) from usage_events, p where created_at >= p.since and status = 'ok'),
    'media_total',          (select count(*) from media_assets),
    'media_bytes',          (select coalesce(sum(size_bytes), 0) from media_assets),
    'plans',                (select coalesce(jsonb_object_agg(plan, c), '{}') from (select plan, count(*) c from profiles group by plan) x),
    'by_day', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
               count(*) as requests,
               coalesce(sum(prompt_tokens + completion_tokens), 0) as tokens,
               coalesce(sum(cost_usd), 0) as cost,
               count(distinct user_id) as users
          from usage_events, p where created_at >= p.since group by 1) d),
    'signups_by_day', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as signups
          from profiles, p where created_at >= p.since group by 1) d),
    'by_model', (select coalesce(jsonb_agg(m), '[]') from (
        select coalesce(model, 'unknown') as model, count(*) as requests,
               coalesce(sum(prompt_tokens + completion_tokens), 0) as tokens, coalesce(sum(cost_usd), 0) as cost
          from usage_events, p where created_at >= p.since group by 1 order by count(*) desc limit 10) m),
    'by_kind', (select coalesce(jsonb_agg(k), '[]') from (
        select kind, count(*) as requests, coalesce(sum(cost_usd), 0) as cost
          from usage_events, p where created_at >= p.since group by 1 order by count(*) desc) k),
    'top_users', (select coalesce(jsonb_agg(u), '[]') from (
        select pr.id, pr.email, pr.full_name, count(*) as requests,
               coalesce(sum(e.prompt_tokens + e.completion_tokens), 0) as tokens, coalesce(sum(e.cost_usd), 0) as cost
          from usage_events e join profiles pr on pr.id = e.user_id, p
         where e.created_at >= p.since group by pr.id, pr.email, pr.full_name order by count(*) desc limit 10) u)
  );
$$;

revoke all on function public.grant_credits(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.grant_daily_credits()             from public, anon, authenticated;
revoke all on function public.admin_overview(int)               from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, bigint, text) to service_role;
grant execute on function public.grant_daily_credits()             to service_role;
grant execute on function public.admin_overview(int)               to service_role;

-- =====================================================================
-- After you sign up, make yourself admin (replace the email):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- (Alternatively put your email in the ADMIN_EMAILS env var.)
-- =====================================================================
