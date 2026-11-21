-- Existing accounts are already onboarded. Only the auth.users INSERT trigger
-- may create a pending signup; recovering a missing profile is not a signup.
begin;

alter table public.profiles
  add column pricing_dismissed_at timestamptz default now(),
  add column onboarding_source text not null default 'existing'
    check (onboarding_source in ('existing', 'signup', 'recovered'));

-- Retain the existing ownership RLS and the original safe editable columns.
alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
revoke update (role, plan, credits_balance, is_banned, pricing_dismissed_at, onboarding_source)
  on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, preferred_model, language, last_seen_at, audience, grade)
  on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- Credit history is owner-readable only; welcome grants are written by the
-- transaction that wins profile insertion, not by a later callback/request.
alter table public.credit_transactions enable row level security;
revoke all on table public.credit_transactions from public, anon, authenticated;
grant select on public.credit_transactions to authenticated;
grant select, insert, update, delete on public.credit_transactions to service_role;
grant usage, select on sequence public.credit_transactions_id_seq to service_role;

create or replace function public.ensure_user_profile(p_user uuid)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  auth_user auth.users%rowtype;
  profile public.profiles%rowtype;
  start_credits bigint;
begin
  -- Check the authoritative user record, never caller-supplied metadata/email.
  -- Concurrent fallback requests serialize on this existing auth user.
  select * into auth_user from auth.users where id = p_user for update;
  if not found then
    raise exception 'Auth user does not exist' using errcode = '23503';
  end if;

  select * into profile from public.profiles where id = p_user;
  if found then return profile; end if;

  -- Malformed/missing settings fail closed to zero, never a hard-coded grant.
  select case
    when jsonb_typeof(value) = 'number' and (value #>> '{}') ~ '^[0-9]{1,15}$'
      then (value #>> '{}')::bigint
    else 0 end
    into start_credits from public.app_settings where key = 'default_credits';

  insert into public.profiles (id, email, full_name, avatar_url, credits_balance, created_at, pricing_dismissed_at, onboarding_source)
  values (
    auth_user.id, auth_user.email,
    coalesce(
      nullif(btrim(regexp_replace(auth_user.raw_user_meta_data->>'full_name', '[[:space:]]+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(auth_user.raw_user_meta_data->>'name', '[[:space:]]+', ' ', 'g')), '')
    ),
    auth_user.raw_user_meta_data->>'avatar_url', coalesce(start_credits, 0),
    coalesce(auth_user.created_at, now()), now(), 'recovered'
  ) on conflict (id) do nothing returning * into profile;

  if found then
    insert into public.credit_transactions (user_id, delta, balance_after, reason)
      values (profile.id, profile.credits_balance, profile.credits_balance, 'profile_recovery');
  else
    select * into profile from public.profiles where id = p_user;
  end if;
  return profile;
end;
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  start_credits bigint;
  inserted_id uuid;
begin
  select case
    when jsonb_typeof(value) = 'number' and (value #>> '{}') ~ '^[0-9]{1,15}$'
      then (value #>> '{}')::bigint
    else 0 end
    into start_credits from public.app_settings where key = 'default_credits';

  insert into public.profiles (id, email, full_name, avatar_url, credits_balance, pricing_dismissed_at, onboarding_source)
  values (
    new.id, new.email,
    coalesce(
      nullif(btrim(regexp_replace(new.raw_user_meta_data->>'full_name', '[[:space:]]+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(new.raw_user_meta_data->>'name', '[[:space:]]+', ' ', 'g')), '')
    ),
    new.raw_user_meta_data->>'avatar_url', coalesce(start_credits, 0), null, 'signup'
  ) on conflict (id) do nothing returning id into inserted_id;

  if inserted_id is not null then
    insert into public.credit_transactions (user_id, delta, balance_after, reason)
      values (inserted_id, coalesce(start_credits, 0), coalesce(start_credits, 0), 'welcome');
  end if;
  return new;
end;
$$;

-- Replacing the trigger function retains on_auth_user_created from 0001.
-- Neither function is callable through the browser Data API.
revoke all on function public.ensure_user_profile(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.ensure_user_profile(uuid) to service_role;
grant execute on function public.handle_new_user() to service_role;

commit;
