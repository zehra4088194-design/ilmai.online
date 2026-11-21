-- 0011 - Owner-scoped Projects and personal Library asset references.
begin;

create unique index if not exists media_assets_id_owner_unique
  on public.media_assets(id, user_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id)
);
create index if not exists projects_owner_updated on public.projects(user_id,updated_at desc);

create table if not exists public.project_assets (
  project_id uuid not null,
  user_id uuid not null,
  media_asset_id uuid not null,
  label text not null default '' check (length(label) <= 160),
  added_at timestamptz not null default now(),
  primary key(project_id,media_asset_id),
  foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade,
  foreign key(media_asset_id,user_id) references public.media_assets(id,user_id) on delete cascade
);
create index if not exists project_assets_owner_project on public.project_assets(user_id,project_id,added_at desc);
create index if not exists project_assets_media_fk on public.project_assets(media_asset_id,user_id);

alter table public.projects enable row level security;
alter table public.project_assets enable row level security;

create policy "owners read projects" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners create projects" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners update projects" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "owners delete projects" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "owners read project assets" on public.project_assets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners link own assets" on public.project_assets
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))
    and exists(select 1 from public.media_assets m where m.id=media_asset_id and m.user_id=(select auth.uid()) and m.status='ready')
  );
create policy "owners unlink project assets" on public.project_assets
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.projects from public,anon,authenticated;
revoke all on public.project_assets from public,anon,authenticated;
grant select,insert,update,delete on public.projects to authenticated;
grant select,insert,delete on public.project_assets to authenticated;
grant all on public.projects to service_role;
grant all on public.project_assets to service_role;

commit;
