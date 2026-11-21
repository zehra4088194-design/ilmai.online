-- User-controlled appearance settings. Only the user's own preferences can be changed.
begin;
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
grant update (preferences) on public.profiles to authenticated;
commit;
