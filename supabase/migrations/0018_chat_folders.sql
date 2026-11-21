-- 0018 - User-owned chat folders.
begin;

create table if not exists public.chat_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  color text not null default '#22c55e'
    check (color in ('#22c55e','#a78bfa','#f472b6','#60a5fa','#f59e0b','#22d3ee','#fb7185','#a3e635')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_folders_user_name_idx
  on public.chat_folders(user_id, lower(name));
create index if not exists chat_folders_user_created_idx
  on public.chat_folders(user_id, created_at);

alter table public.chat_folders enable row level security;
revoke all on public.chat_folders from public, anon, authenticated;
grant select, insert, update, delete on public.chat_folders to authenticated;

create policy "own chat folders" on public.chat_folders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.conversations
  add column if not exists folder_id uuid references public.chat_folders(id) on delete set null;

create index if not exists conversations_user_folder_updated_idx
  on public.conversations(user_id, folder_id, updated_at desc);

drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      folder_id is null
      or exists (
        select 1 from public.chat_folders f
        where f.id = folder_id and f.user_id = (select auth.uid())
      )
    )
  );

commit;
