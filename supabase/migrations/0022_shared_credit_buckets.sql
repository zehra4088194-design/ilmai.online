-- Shared monthly plan-credit buckets, wallet split accounting and provider usage detail.
begin;

alter table public.profiles
  add column if not exists credits_reserved bigint not null default 0;

create table if not exists public.plan_credit_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null check (plan_id in ('free','pro','elite')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  credits_granted bigint not null check (credits_granted >= 0),
  credits_remaining bigint not null check (credits_remaining >= 0),
  credits_reserved bigint not null default 0 check (credits_reserved >= 0),
  status text not null default 'active' check (status in ('active','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  check (credits_reserved <= credits_remaining),
  unique (user_id, period_start, period_end)
);

create index if not exists plan_credit_buckets_active_owner
  on public.plan_credit_buckets(user_id, period_end desc, period_start desc)
  where status='active';
alter table public.plan_credit_buckets enable row level security;
revoke all on public.plan_credit_buckets from public, anon, authenticated;
grant all on public.plan_credit_buckets to service_role;

alter table public.generation_requests
  add column if not exists plan_bucket_id uuid references public.plan_credit_buckets(id) on delete restrict,
  add column if not exists plan_reserved bigint not null default 0,
  add column if not exists wallet_reserved bigint not null default 0;

-- Existing in-flight reservations were made against the ordinary wallet.
update public.generation_requests
set wallet_reserved=reserved
where status='reserved' and plan_reserved=0 and wallet_reserved=0 and reserved>0;

alter table public.credit_transactions
  add column if not exists wallet_delta bigint not null default 0,
  add column if not exists plan_delta bigint not null default 0,
  add column if not exists plan_bucket_id uuid references public.plan_credit_buckets(id) on delete set null;

-- All pre-existing credits were held in the permanent wallet before plan allowances existed.
update public.credit_transactions
set wallet_delta=delta
where wallet_delta=0 and plan_delta=0 and delta<>0;

alter table public.usage_events
  add column if not exists provider_usage jsonb not null default '{}'::jsonb,
  add column if not exists usage_details jsonb not null default '{}'::jsonb,
  add column if not exists model_tier text,
  add column if not exists credit_multiplier numeric(8,3) not null default 1,
  add column if not exists plan_credits_used bigint not null default 0,
  add column if not exists wallet_credits_used bigint not null default 0;

insert into public.app_settings(key,value) values
  ('standard_model_multiplier','1'::jsonb),
  ('premium_model_multiplier','4'::jsonb)
on conflict(key) do nothing;

alter table public.usage_events
  add constraint usage_events_credit_multiplier_positive check (credit_multiplier > 0),
  add constraint usage_events_credit_split_nonnegative check (plan_credits_used >= 0 and wallet_credits_used >= 0);

create index if not exists plan_credit_events_owner
  on public.usage_events(user_id, created_at desc);

create or replace function public.get_credit_balances(p_user uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $
  select jsonb_build_object(
    'walletBalance',p.credits_balance,
    'walletReserved',p.credits_reserved,
    'planBalance',coalesce(b.credits_remaining,0),
    'planReserved',coalesce(b.credits_reserved,0),
    'planId',b.plan_id,
    'periodStart',b.period_start,
    'periodEnd',b.period_end
  )
  from public.profiles p
  left join lateral (
    select plan_id,credits_remaining,credits_reserved,period_start,period_end
    from public.plan_credit_buckets
    where user_id=p.id and status='active'
      and period_start<=now() and period_end>now()
    order by period_start desc,created_at desc
    limit 1
  ) b on true
  where p.id=p_user and not p.is_banned;
$;

revoke all on function public.get_credit_balances(uuid) from public,anon,authenticated;
grant execute on function public.get_credit_balances(uuid) to service_role;

create or replace function public.charge_credits(
  p_user uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet_balance bigint;
  v_wallet_reserved bigint;
  v_wallet_available bigint;
  v_plan_available bigint := 0;
  v_plan_used bigint := 0;
  v_wallet_used bigint := 0;
  v_bucket_id uuid;
  v_bucket_remaining bigint;
  v_bucket_reserved bigint;
  v_new_wallet_balance bigint;
  v_existing public.credit_transactions;
begin
  if p_user is null or p_amount is null or p_amount <= 0 or length(coalesce(p_reason,'')) > 200
     or (p_idempotency_key is not null and length(p_idempotency_key) > 300) then
    raise exception 'invalid_credit_charge' using errcode='22023';
  end if;

  select * into v_existing from public.credit_transactions
  where user_id=p_user and idempotency_key=p_idempotency_key
    and p_idempotency_key is not null;
  if found then
    select credits_balance into v_new_wallet_balance from public.profiles where id=p_user;
    return jsonb_build_object(
      'walletBalance',v_new_wallet_balance,
      'planCreditsUsed',greatest(0,-v_existing.plan_delta),
      'walletCreditsUsed',greatest(0,-v_existing.wallet_delta),
      'planBucketId',v_existing.plan_bucket_id,
      'duplicate',true
    );
  end if;

  select credits_balance,credits_reserved
    into v_wallet_balance,v_wallet_reserved
    from public.profiles
    where id=p_user and not is_banned
    for update;
  if not found then raise exception 'user_unavailable' using errcode='P0002'; end if;

  -- Re-check after locking the profile so concurrent retries cannot double-debit.
  if p_idempotency_key is not null then
    select * into v_existing from public.credit_transactions
    where user_id=p_user and idempotency_key=p_idempotency_key;
    if found then
      return jsonb_build_object(
        'walletBalance',v_wallet_balance,
        'planCreditsUsed',greatest(0,-v_existing.plan_delta),
        'walletCreditsUsed',greatest(0,-v_existing.wallet_delta),
        'planBucketId',v_existing.plan_bucket_id,
        'duplicate',true
      );
    end if;
  end if;

  select id,credits_remaining,credits_reserved
    into v_bucket_id,v_bucket_remaining,v_bucket_reserved
    from public.plan_credit_buckets
    where user_id=p_user and status='active'
      and period_start<=now() and period_end>now()
      and credits_remaining>credits_reserved
    order by period_start desc,created_at desc
    limit 1
    for update;

  if found then
    v_plan_available := greatest(0,v_bucket_remaining-v_bucket_reserved);
  end if;
  v_wallet_available := greatest(0,v_wallet_balance-v_wallet_reserved);
  if v_plan_available+v_wallet_available < p_amount then
    raise exception 'insufficient_credits' using errcode='P0001';
  end if;

  v_plan_used := least(p_amount,v_plan_available);
  v_wallet_used := p_amount-v_plan_used;

  if v_plan_used>0 then
    update public.plan_credit_buckets
      set credits_remaining=credits_remaining-v_plan_used,updated_at=now()
      where id=v_bucket_id;
  end if;

  update public.profiles
    set credits_balance=credits_balance-v_wallet_used
    where id=p_user
    returning credits_balance into v_new_wallet_balance;

  insert into public.credit_transactions(
    user_id,delta,balance_after,reason,idempotency_key,wallet_delta,plan_delta,plan_bucket_id
  ) values (
    p_user,-p_amount,p_new_wallet_balance,p_reason,p_idempotency_key,
    -v_wallet_used,-v_plan_used,case when v_plan_used>0 then v_bucket_id else null end
  );

  return jsonb_build_object(
    'walletBalance',v_new_wallet_balance,
    'planCreditsUsed',v_plan_used,
    'walletCreditsUsed',v_wallet_used,
    'planBucketId',case when v_plan_used>0 then v_bucket_id else null end,
    'duplicate',false
  );
end;
$$;

create or replace function public.reserve_generation(
  p_id uuid,p_user uuid,p_key text,p_kind text,p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.generation_requests;
  v_wallet_balance bigint;
  v_wallet_reserved bigint;
  v_wallet_available bigint;
  v_plan_available bigint := 0;
  v_plan_reserved bigint := 0;
  v_wallet_part bigint := 0;
  v_bucket_id uuid;
  v_bucket_remaining bigint;
  v_bucket_reserved bigint;
  v_request public.generation_requests;
begin
  if p_amount<0 or p_key is null or length(p_key)>300 or p_user is null or p_id is null then
    raise exception 'invalid_reservation';
  end if;

  select credits_balance,credits_reserved
    into v_wallet_balance,v_wallet_reserved
    from public.profiles
    where id=p_user and not is_banned
    for update;
  if not found then raise exception 'user_unavailable' using errcode='P0002'; end if;

  select * into v_existing from public.generation_requests
    where user_id=p_user and request_key=p_key;
  if found then
    return jsonb_build_object(
      'id',v_existing.id,'status',v_existing.status,'duplicate',true,'result',v_existing.result
    );
  end if;

  select id,credits_remaining,credits_reserved
    into v_bucket_id,v_bucket_remaining,v_bucket_reserved
    from public.plan_credit_buckets
    where user_id=p_user and status='active'
      and period_start<=now() and period_end>now()
      and credits_remaining>credits_reserved
    order by period_start desc,created_at desc
    limit 1
    for update;
  if found then
    v_plan_available := greatest(0,v_bucket_remaining-v_bucket_reserved);
  end if;

  v_wallet_available := greatest(0,v_wallet_balance-v_wallet_reserved);
  if v_plan_available+v_wallet_available<p_amount then
    raise exception 'insufficient_credits';
  end if;

  v_plan_reserved := least(p_amount,v_plan_available);
  v_wallet_part := p_amount-v_plan_reserved;

  insert into public.generation_requests(
    id,user_id,request_key,kind,reserved,plan_bucket_id,plan_reserved,wallet_reserved
  ) values (
    p_id,p_user,p_key,p_kind,p_amount,
    case when v_plan_reserved>0 then v_bucket_id else null end,
    v_plan_reserved,v_wallet_part
  ) returning * into v_request;

  if v_wallet_part>0 then
    update public.profiles set credits_reserved=credits_reserved+v_wallet_part where id=p_user;
  end if;
  if v_plan_reserved>0 then
    update public.plan_credit_buckets
      set credits_reserved=credits_reserved+v_plan_reserved,updated_at=now()
      where id=v_bucket_id;
  end if;

  return jsonb_build_object('id',v_request.id,'status',v_request.status,'duplicate',false);
end;
$$;

create or replace function public.settle_generation(
  p_id uuid,p_user uuid,p_charge bigint,p_usage jsonb,
  p_result jsonb default null,p_message jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.generation_requests;
  v_new_balance bigint;
  v_plan_charge bigint;
  v_wallet_charge bigint;
  v_message_id uuid;
begin
  select * into r from public.generation_requests
    where id=p_id and user_id=p_user for update;
  if r.id is null then raise exception 'generation_not_found'; end if;
  if r.status='completed' then
    return jsonb_build_object('charged',r.charged,'result',r.result);
  end if;
  if r.status<>'reserved' then raise exception 'generation_not_active'; end if;
  if p_charge<0 or p_charge>r.reserved then raise exception 'charge_exceeds_reservation'; end if;

  v_plan_charge := least(p_charge,r.plan_reserved);
  v_wallet_charge := p_charge-v_plan_charge;
  if v_wallet_charge>r.wallet_reserved then raise exception 'charge_exceeds_wallet_reservation'; end if;

  if r.plan_reserved>0 then
    update public.plan_credit_buckets
      set credits_reserved=credits_reserved-r.plan_reserved,
          credits_remaining=case
            when status='active' and period_end>now() then credits_remaining-v_plan_charge
            else greatest(0,credits_remaining-r.plan_reserved)
          end,
          status=case when period_end<=now() then 'expired' else status end,
          updated_at=now()
      where id=r.plan_bucket_id and credits_reserved>=r.plan_reserved
        and credits_remaining>=case
          when status='active' and period_end>now() then v_plan_charge
          else r.plan_reserved
        end;
    if not found then raise exception 'plan_credit_reservation_lost'; end if;
  end if;

  update public.profiles
    set credits_reserved=credits_reserved-r.wallet_reserved,
        credits_balance=credits_balance-v_wallet_charge
    where id=p_user
      and credits_reserved>=r.wallet_reserved
      and credits_balance>=v_wallet_charge
    returning credits_balance into v_new_balance;
  if not found then raise exception 'wallet_reservation_lost'; end if;

  if p_charge>0 then
    insert into public.credit_transactions(
      user_id,delta,balance_after,reason,idempotency_key,wallet_delta,plan_delta,plan_bucket_id
    ) values (
      p_user,-p_charge,v_new_balance,r.kind,'generation:'||p_id::text,
      -v_wallet_charge,-v_plan_charge,case when v_plan_charge>0 then r.plan_bucket_id else null end
    );
  end if;

  if p_message is not null then
    if not exists(
      select 1 from public.conversations
      where id=(p_message->>'conversation_id')::uuid and user_id=p_user
    ) then raise exception 'conversation_not_found'; end if;
    insert into public.messages(
      conversation_id,user_id,role,content,model,prompt_tokens,completion_tokens,cost_usd,meta
    ) values (
      (p_message->>'conversation_id')::uuid,p_user,'assistant',p_message->>'content',
      p_usage->>'model',(p_usage->>'prompt_tokens')::int,(p_usage->>'completion_tokens')::int,
      (p_usage->>'cost_usd')::numeric,
      coalesce(p_message->'meta','{}')||jsonb_build_object(
        'credits_used',p_charge,'plan_credits_used',v_plan_charge,
        'wallet_credits_used',v_wallet_charge,'request_id',p_id
      )
    ) returning id into v_message_id;
    update public.conversations set updated_at=now()
      where id=(p_message->>'conversation_id')::uuid;
  end if;

  insert into public.usage_events(
    user_id,kind,model,provider,prompt_tokens,completion_tokens,cost_usd,credits_used,
    latency_ms,status,request_id,provider_usage,usage_details,model_tier,credit_multiplier,
    plan_credits_used,wallet_credits_used
  ) values (
    p_user,r.kind,p_usage->>'model',p_usage->>'provider',
    greatest(0,coalesce((p_usage->>'prompt_tokens')::int,0)),
    greatest(0,coalesce((p_usage->>'completion_tokens')::int,0)),
    greatest(0,coalesce((p_usage->>'cost_usd')::numeric,0)),p_charge,
    (p_usage->>'latency_ms')::int,'ok',p_id,
    coalesce(p_usage->'provider_usage','{}'::jsonb),
    coalesce(p_usage->'usage_details','{}'::jsonb),
    nullif(p_usage->>'model_tier',''),
    greatest(0.001,coalesce((p_usage->>'credit_multiplier')::numeric,1)),
    v_plan_charge,v_wallet_charge
  );

  update public.generation_requests
    set status='completed',charged=p_charge,
        result=coalesce(p_result,'{}')||jsonb_build_object('messageId',v_message_id),
        completed_at=now()
    where id=p_id;
  return jsonb_build_object(
    'charged',p_charge,'balance',v_new_balance,'planCreditsUsed',v_plan_charge,
    'walletCreditsUsed',v_wallet_charge,'messageId',v_message_id
  );
end;
$$;

create or replace function public.release_generation(
  p_id uuid,p_user uuid,p_cancelled boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.generation_requests;
begin
  select * into r from public.generation_requests
    where id=p_id and user_id=p_user for update;
  if r.id is null or r.status<>'reserved' then return; end if;

  if r.plan_reserved>0 then
    update public.plan_credit_buckets
      set credits_reserved=credits_reserved-r.plan_reserved,
          credits_remaining=case
            when status='active' and period_end>now() then credits_remaining
            else greatest(0,credits_remaining-r.plan_reserved)
          end,
          status=case when period_end<=now() then 'expired' else status end,
          updated_at=now()
      where id=r.plan_bucket_id and credits_reserved>=r.plan_reserved;
    if not found then raise exception 'plan_credit_reservation_lost'; end if;
  end if;

  if r.wallet_reserved>0 then
    update public.profiles set credits_reserved=credits_reserved-r.wallet_reserved
      where id=p_user and credits_reserved>=r.wallet_reserved;
    if not found then raise exception 'wallet_reservation_lost'; end if;
  end if;

  update public.generation_requests
    set status=case when p_cancelled then 'cancelled' else 'failed' end,completed_at=now()
    where id=p_id;
end;
$$;

create or replace function public.grant_credits(p_user uuid,p_amount bigint,p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_charge jsonb;
begin
  if p_user is null or p_amount is null or length(coalesce(p_reason,''))>200 then
    raise exception 'invalid_credit_adjustment' using errcode='22023';
  end if;
  if p_amount<0 then
    v_charge := public.charge_credits(p_user,-p_amount,p_reason,null);
    return (v_charge->>'walletBalance')::bigint;
  end if;
  if p_amount=0 then
    select credits_balance into v_balance from public.profiles where id=p_user;
    return v_balance;
  end if;

  update public.profiles set credits_balance=credits_balance+p_amount
    where id=p_user returning credits_balance into v_balance;
  if not found then raise exception 'user_not_found'; end if;
  insert into public.credit_transactions(user_id,delta,balance_after,reason,wallet_delta,plan_delta)
    values(p_user,p_amount,v_balance,p_reason,p_amount,0);
  return v_balance;
end;
$$;

create or replace function public.grant_daily_credits()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  target bigint;
  p record;
  n int := 0;
  delta bigint;
  day_key text := 'daily:'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
begin
  perform pg_advisory_xact_lock(7194041);
  select greatest(0,coalesce((value #>> '{}')::bigint,100))
    into target from public.app_settings where key='daily_free_credits';
  for p in
    select id,credits_balance from public.profiles
    where plan='free' and not is_banned order by id for update
  loop
    if exists(
      select 1 from public.credit_transactions
      where user_id=p.id and idempotency_key=day_key
    ) then continue; end if;
    delta := greatest(0,coalesce(target,100)-p.credits_balance);
    update public.profiles set credits_balance=credits_balance+delta where id=p.id;
    insert into public.credit_transactions(
      user_id,delta,balance_after,reason,idempotency_key,wallet_delta,plan_delta
    ) values(
      p.id,delta,p.credits_balance+delta,'daily_free_topup',day_key,delta,0
    );
    n := n+1;
  end loop;
  return n;
end;
$$;

create or replace function public.expire_generation_reservations()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id,user_id from public.generation_requests
    where status='reserved' and expires_at<now()
    for update skip locked
  loop
    perform public.release_generation(r.id,r.user_id,false);
    n := n+1;
  end loop;
  return n;
end;
$$;

revoke all on function public.charge_credits(uuid,bigint,text,text) from public,anon,authenticated;
revoke all on function public.reserve_generation(uuid,uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.settle_generation(uuid,uuid,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.release_generation(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.grant_credits(uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.grant_daily_credits() from public,anon,authenticated;
revoke all on function public.expire_generation_reservations() from public,anon,authenticated;
grant execute on function public.charge_credits(uuid,bigint,text,text) to service_role;
grant execute on function public.reserve_generation(uuid,uuid,text,text,bigint) to service_role;
grant execute on function public.settle_generation(uuid,uuid,bigint,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.release_generation(uuid,uuid,boolean) to service_role;
grant execute on function public.grant_credits(uuid,bigint,text) to service_role;
grant execute on function public.grant_daily_credits() to service_role;
grant execute on function public.expire_generation_reservations() to service_role;

commit;
