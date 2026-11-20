-- 0012 - Persistent asynchronous video generation jobs and atomic settlement.
begin;

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_key text not null,
  generation_request_id uuid not null references public.generation_requests(id) on delete restrict,
  provider_job_id text not null unique,
  model text not null,
  prompt text not null check (length(prompt) between 1 and 6000),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('queued','submitted','processing','downloading','storing','ready','failed','cancelled','expired')),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  credits_reserved bigint not null check (credits_reserved >= 0),
  credits_charged bigint not null default 0 check (credits_charged >= 0),
  provider_usage jsonb not null default '{}'::jsonb,
  error text,
  submitted_at timestamptz not null default now(),
  last_polled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, request_key),
  unique(id,user_id)
);
create index if not exists video_jobs_owner_created on public.video_jobs(user_id,created_at desc);
create index if not exists video_jobs_active_poll on public.video_jobs(status,updated_at)
  where status in ('queued','submitted','processing','downloading','storing');
create index if not exists video_jobs_generation_fk on public.video_jobs(generation_request_id);

alter table public.video_jobs enable row level security;
create policy "owners read video jobs" on public.video_jobs
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.video_jobs from public,anon,authenticated;
grant all on public.video_jobs to service_role;

create or replace function public.complete_video_job(
  p_job uuid,
  p_user uuid,
  p_asset uuid,
  p_charge bigint,
  p_usage jsonb,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.video_jobs;
  v_asset public.media_assets;
  v_settlement jsonb;
begin
  select * into v_job from public.video_jobs
    where id=p_job and user_id=p_user for update;
  if not found then raise exception 'video_job_not_found' using errcode='P0002'; end if;
  if v_job.status='ready' then
    return jsonb_build_object('status','ready','assetId',v_job.media_asset_id,'creditsCharged',v_job.credits_charged);
  end if;
  if v_job.status<>'storing' then
    raise exception 'video_job_not_storing' using errcode='40001';
  end if;
  if p_charge<0 or p_charge>v_job.credits_reserved then
    raise exception 'video_charge_exceeds_reservation' using errcode='22023';
  end if;
  select * into v_asset from public.media_assets
    where id=p_asset and user_id=p_user and kind='video' and status='ready';
  if not found then raise exception 'video_asset_not_owned' using errcode='42501'; end if;

  v_settlement := public.settle_generation(
    v_job.generation_request_id,p_user,p_charge,p_usage,
    coalesce(p_result,'{}'::jsonb)||jsonb_build_object('videoJobId',p_job,'assetId',p_asset),
    null
  );
  update public.video_jobs
    set status='ready',media_asset_id=p_asset,credits_charged=p_charge,
        provider_usage=coalesce(p_usage,'{}'::jsonb),error=null,completed_at=now(),updated_at=now()
    where id=p_job and user_id=p_user;
  return jsonb_build_object('status','ready','assetId',p_asset,'creditsCharged',p_charge,'settlement',v_settlement);
end;
$$;

create or replace function public.fail_video_job(
  p_job uuid,
  p_user uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.video_jobs;
begin
  if p_status not in ('failed','cancelled','expired') then
    raise exception 'invalid_video_terminal_status' using errcode='22023';
  end if;
  select * into v_job from public.video_jobs
    where id=p_job and user_id=p_user for update;
  if not found then raise exception 'video_job_not_found' using errcode='P0002'; end if;
  if v_job.status='ready' then return jsonb_build_object('status','ready','assetId',v_job.media_asset_id); end if;
  if v_job.status in ('failed','cancelled','expired') then
    return jsonb_build_object('status',v_job.status,'error',v_job.error);
  end if;
  perform public.release_generation(v_job.generation_request_id,p_user,p_status='cancelled');
  update public.video_jobs
    set status=p_status,error=left(coalesce(p_error,''),1000),completed_at=now(),updated_at=now()
    where id=p_job and user_id=p_user;
  return jsonb_build_object('status',p_status);
end;
$$;

revoke all on function public.complete_video_job(uuid,uuid,uuid,bigint,jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.fail_video_job(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_video_job(uuid,uuid,uuid,bigint,jsonb,jsonb) to service_role;
grant execute on function public.fail_video_job(uuid,uuid,text,text) to service_role;

update public.feature_flags
set enabled=true,visible=true,coming_soon=false,min_plan='pro',
    config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'credits_per_second',100,
      'max_duration_seconds',30,
      'max_reference_mb',12,
      'max_video_mb',150,
      'max_concurrent_jobs',2,
      'allowed_models',jsonb_build_array()
    ),
    updated_at=now()
where key='video_generation';

commit;
