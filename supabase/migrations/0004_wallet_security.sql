alter table public.profiles add column if not exists credits_reserved bigint not null default 0;
alter table public.profiles add constraint profiles_wallet_nonnegative check (credits_balance >= 0 and credits_reserved >= 0 and credits_reserved <= credits_balance);
alter table public.credit_transactions add column if not exists idempotency_key text;
create unique index credit_transaction_idempotency on public.credit_transactions(user_id, idempotency_key) where idempotency_key is not null;

create table public.generation_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_key text not null,
  kind text not null check (kind in ('chat','compare','image','video','presentation','test')),
  reserved bigint not null check (reserved >= 0),
  charged bigint not null default 0 check (charged >= 0),
  status text not null default 'reserved' check (status in ('reserved','completed','failed','cancelled')),
  result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  completed_at timestamptz,
  unique(user_id, request_key)
);
create index generation_requests_owner on public.generation_requests(user_id, created_at desc);
create index generation_requests_expiry on public.generation_requests(expires_at) where status = 'reserved';
alter table public.generation_requests enable row level security;
revoke all on public.generation_requests from anon, authenticated;
grant all on public.generation_requests to service_role;
alter table public.usage_events add column if not exists request_id uuid references public.generation_requests(id);
alter table public.usage_events add column if not exists provider text;
create unique index usage_request_unique on public.usage_events(request_id) where request_id is not null;

create or replace function public.reserve_generation(p_id uuid, p_user uuid, p_key text, p_kind text, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.generation_requests; available bigint;
begin
  if p_amount < 0 or length(p_key) > 300 then raise exception 'invalid_reservation'; end if;
  insert into public.generation_requests(id,user_id,request_key,kind,reserved)
    values(p_id,p_user,p_key,p_kind,p_amount) on conflict(user_id,request_key) do nothing returning * into r;
  if r.id is null then
    select * into r from public.generation_requests where user_id=p_user and request_key=p_key;
    return jsonb_build_object('id',r.id,'status',r.status,'duplicate',true,'result',r.result);
  end if;
  select credits_balance-credits_reserved into available from public.profiles where id=p_user and not is_banned for update;
  if available is null or available < p_amount then raise exception 'insufficient_credits'; end if;
  update public.profiles set credits_reserved=credits_reserved+p_amount where id=p_user;
  return jsonb_build_object('id',r.id,'status',r.status,'duplicate',false);
end $$;

create or replace function public.settle_generation(p_id uuid, p_user uuid, p_charge bigint, p_usage jsonb, p_result jsonb default null, p_message jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.generation_requests; new_balance bigint; message_id uuid;
begin
  select * into r from public.generation_requests where id=p_id and user_id=p_user for update;
  if r.id is null then raise exception 'generation_not_found'; end if;
  if r.status='completed' then return jsonb_build_object('charged',r.charged,'result',r.result); end if;
  if r.status<>'reserved' then raise exception 'generation_not_active'; end if;
  if p_charge<0 or p_charge>r.reserved then raise exception 'charge_exceeds_reservation'; end if;
  update public.profiles set credits_reserved=credits_reserved-r.reserved, credits_balance=credits_balance-p_charge
    where id=p_user returning credits_balance into new_balance;
  if p_charge>0 then
    insert into public.credit_transactions(user_id,delta,balance_after,reason,idempotency_key)
      values(p_user,-p_charge,new_balance,r.kind,'generation:'||p_id::text);
  end if;
  if p_message is not null then
    if not exists(select 1 from public.conversations where id=(p_message->>'conversation_id')::uuid and user_id=p_user) then
      raise exception 'conversation_not_found';
    end if;
    insert into public.messages(conversation_id,user_id,role,content,model,prompt_tokens,completion_tokens,cost_usd,meta)
      values((p_message->>'conversation_id')::uuid,p_user,'assistant',p_message->>'content',p_usage->>'model',
      (p_usage->>'prompt_tokens')::int,(p_usage->>'completion_tokens')::int,(p_usage->>'cost_usd')::numeric,
      coalesce(p_message->'meta','{}')||jsonb_build_object('credits_used',p_charge,'request_id',p_id)) returning id into message_id;
    update public.conversations set updated_at=now() where id=(p_message->>'conversation_id')::uuid;
  end if;
  insert into public.usage_events(user_id,kind,model,provider,prompt_tokens,completion_tokens,cost_usd,credits_used,latency_ms,status,request_id)
    values(p_user,r.kind,p_usage->>'model',p_usage->>'provider',
      greatest(0,coalesce((p_usage->>'prompt_tokens')::int,0)),greatest(0,coalesce((p_usage->>'completion_tokens')::int,0)),
      greatest(0,coalesce((p_usage->>'cost_usd')::numeric,0)),p_charge,(p_usage->>'latency_ms')::int,'ok',p_id);
  update public.generation_requests set status='completed',charged=p_charge,result=coalesce(p_result,'{}')||jsonb_build_object('messageId',message_id),completed_at=now() where id=p_id;
  return jsonb_build_object('charged',p_charge,'balance',new_balance,'messageId',message_id);
end $$;

create or replace function public.release_generation(p_id uuid, p_user uuid, p_cancelled boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.generation_requests;
begin
  select * into r from public.generation_requests where id=p_id and user_id=p_user for update;
  if r.id is null or r.status<>'reserved' then return; end if;
  update public.profiles set credits_reserved=credits_reserved-r.reserved where id=p_user;
  update public.generation_requests set status=case when p_cancelled then 'cancelled' else 'failed' end,completed_at=now() where id=p_id;
end $$;

create or replace function public.grant_credits(p_user uuid, p_amount bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_bal bigint;
begin
  update public.profiles set credits_balance=credits_balance+p_amount
    where id=p_user and credits_balance-credits_reserved+p_amount>=0 returning credits_balance into new_bal;
  if new_bal is null then raise exception 'insufficient_credits'; end if;
  insert into public.credit_transactions(user_id,delta,balance_after,reason) values(p_user,p_amount,new_bal,p_reason);
  return new_bal;
end $$;

create or replace function public.grant_daily_credits() returns int
language plpgsql security definer set search_path = '' as $$
declare target bigint; p record; n int := 0; delta bigint; day_key text := 'daily:'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
begin
  perform pg_advisory_xact_lock(7194041);
  select greatest(0,coalesce((value #>> '{}')::bigint,100)) into target from public.app_settings where key='daily_free_credits';
  for p in select id,credits_balance from public.profiles where plan='free' and not is_banned order by id for update loop
    if exists(select 1 from public.credit_transactions where user_id=p.id and idempotency_key=day_key) then continue; end if;
    delta := greatest(0,coalesce(target,100)-p.credits_balance);
    update public.profiles set credits_balance=credits_balance+delta where id=p.id;
    insert into public.credit_transactions(user_id,delta,balance_after,reason,idempotency_key)
      values(p.id,delta,p.credits_balance+delta,'daily_free_topup',day_key);
    n := n+1;
  end loop;
  return n;
end $$;

create or replace function public.expire_generation_reservations() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id,user_id from public.generation_requests where status='reserved' and expires_at<now() for update skip locked loop
    perform public.release_generation(r.id,r.user_id,false);
    n := n+1;
  end loop;
  return n;
end $$;

revoke all on function public.reserve_generation(uuid,uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.settle_generation(uuid,uuid,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.release_generation(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.expire_generation_reservations() from public,anon,authenticated;
grant execute on function public.reserve_generation(uuid,uuid,text,text,bigint) to service_role;
grant execute on function public.settle_generation(uuid,uuid,bigint,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.release_generation(uuid,uuid,boolean) to service_role;
grant execute on function public.expire_generation_reservations() to service_role;

drop policy "own messages" on public.messages;
create policy "own messages read" on public.messages for select to authenticated
  using ((select auth.uid())=user_id and exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
create policy "own user messages insert" on public.messages for insert to authenticated
  with check ((select auth.uid())=user_id and role='user' and exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
revoke insert,update,delete on public.messages from authenticated;
grant insert(conversation_id,user_id,role,content,attachments) on public.messages to authenticated;
