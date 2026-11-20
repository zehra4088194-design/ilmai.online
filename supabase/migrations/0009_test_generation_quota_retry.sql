-- 0009 - Preserve idempotent Test Studio retries even when quota is already full.
begin;

create or replace function public.reserve_test_generation(
  p_id uuid,
  p_user uuid,
  p_key text,
  p_amount bigint,
  p_daily_limit integer,
  p_monthly_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily bigint;
  v_monthly bigint;
  v_existing public.generation_requests;
begin
  if p_user is null or p_id is null or p_key is null or length(p_key) > 300
     or p_amount < 0 or p_daily_limit < 0 or p_monthly_limit < 0 then
    raise exception 'invalid_test_reservation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':test-studio', 0));

  -- A retry for the same idempotency key must return the original request before quota checks.
  select * into v_existing from public.generation_requests
    where user_id=p_user and request_key=p_key;
  if found then
    return jsonb_build_object(
      'id',v_existing.id,'status',v_existing.status,'duplicate',true,'result',v_existing.result
    );
  end if;

  select
    (select count(*) from public.usage_events
      where user_id = p_user and kind = 'test' and created_at >= now() - interval '24 hours')
    +
    (select count(*) from public.generation_requests
      where user_id = p_user and kind = 'test' and status = 'reserved'
        and created_at >= now() - interval '24 hours' and expires_at > now())
  into v_daily;

  if p_daily_limit > 0 and v_daily >= p_daily_limit then
    raise exception 'test_daily_limit' using errcode = 'P0001';
  end if;

  select
    (select count(*) from public.usage_events
      where user_id = p_user and kind = 'test'
        and created_at >= date_trunc('month', now()))
    +
    (select count(*) from public.generation_requests
      where user_id = p_user and kind = 'test' and status = 'reserved'
        and created_at >= date_trunc('month', now()) and expires_at > now())
  into v_monthly;

  if p_monthly_limit > 0 and v_monthly >= p_monthly_limit then
    raise exception 'test_monthly_limit' using errcode = 'P0001';
  end if;

  return public.reserve_generation(p_id, p_user, p_key, 'test', p_amount);
end;
$$;

revoke all on function public.reserve_test_generation(uuid,uuid,text,bigint,integer,integer)
  from public, anon, authenticated;
grant execute on function public.reserve_test_generation(uuid,uuid,text,bigint,integer,integer)
  to service_role;

commit;
