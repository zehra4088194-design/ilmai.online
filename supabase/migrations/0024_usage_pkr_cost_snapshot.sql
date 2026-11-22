-- Snapshot the configured USD/PKR rate on each usage event and tidy billing indexes.
begin;

alter table public.usage_events
  add column if not exists cost_pkr numeric(14,4),
  add column if not exists usd_to_pkr numeric(12,4);

create or replace function public.snapshot_usage_exchange_rate()
returns trigger
language plpgsql
set search_path = ''
as $fx$
declare
  v_rate_json jsonb;
  v_rate numeric;
begin
  select value into v_rate_json
  from public.app_settings
  where key='usd_pkr_rate';

  if new.usd_to_pkr is null and jsonb_typeof(v_rate_json)='object' then
    v_rate := nullif(v_rate_json->>'usdToPkr','')::numeric;
    new.usd_to_pkr := v_rate;
  end if;

  if new.cost_pkr is null and new.usd_to_pkr is not null then
    new.cost_pkr := round(coalesce(new.cost_usd,0)*new.usd_to_pkr,4);
  end if;
  return new;
end;
$fx$;

drop trigger if exists usage_events_snapshot_exchange_rate on public.usage_events;
create trigger usage_events_snapshot_exchange_rate
before insert or update of cost_usd,usd_to_pkr
on public.usage_events
for each row
execute function public.snapshot_usage_exchange_rate();

-- usage_user_idx already covers (user_id, created_at DESC); avoid an identical second index.
drop index if exists public.plan_credit_events_owner;

-- Cover the two newly-added foreign keys to keep delete/update checks efficient.
create index if not exists credit_transactions_plan_bucket_idx
  on public.credit_transactions(plan_bucket_id)
  where plan_bucket_id is not null;
create index if not exists generation_requests_plan_bucket_idx
  on public.generation_requests(plan_bucket_id)
  where plan_bucket_id is not null;

commit;
