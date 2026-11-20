-- 0013 - Billing plans, discounts, payments, subscriptions, webhooks, email outbox and site creatives.
begin;

create table if not exists public.billing_plans (
  id text primary key check (id in ('free','pro','elite')),
  name text not null,
  description text not null default '',
  currency text not null default 'PKR' check (currency in ('PKR','USD')),
  price_amount numeric(12,2) not null default 0 check (price_amount >= 0),
  credits_per_period bigint not null default 0 check (credits_per_period >= 0),
  period_days integer not null default 30 check (period_days between 1 and 366),
  paddle_price_id text,
  paddle_product_id text,
  paypro_enabled boolean not null default false,
  active boolean not null default false,
  display_features jsonb not null default '[]'::jsonb check (jsonb_typeof(display_features)='array'),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.billing_plans(id,name,description,currency,price_amount,credits_per_period,period_days,active,sort_order,display_features)
values
  ('free','Free','A starter plan for exploring Ilm AI','PKR',0,0,30,true,0,'["Core chat access subject to limits"]'::jsonb),
  ('pro','Pro','For regular study and content creation','PKR',0,0,30,false,1,'["Higher model access","Test Studio","Video Studio"]'::jsonb),
  ('elite','Elite','For heavy use and advanced workflows','PKR',0,0,30,false,2,'["Highest model access","Priority limits","Advanced creation tools"]'::jsonb)
on conflict(id) do nothing;

create table if not exists public.billing_discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null default '',
  discount_type text not null check (discount_type in ('percent','fixed')),
  value numeric(12,2) not null check (value > 0),
  currency text check (currency in ('PKR','USD')),
  paddle_discount_id text,
  active boolean not null default true,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit integer not null default 1 check (per_user_limit between 1 and 20),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or value <= 100)
);
create index if not exists billing_discounts_active_window on public.billing_discounts(active,starts_at,ends_at);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('paddle','paypro')),
  provider_reference text,
  trade_no text unique,
  plan_id text not null references public.billing_plans(id),
  discount_id uuid references public.billing_discounts(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null check (currency in ('PKR','USD')),
  credits_to_grant bigint not null check (credits_to_grant >= 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded','cancelled')),
  customer_email text,
  payment_method text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payments_provider_reference_unique
  on public.payments(provider,provider_reference) where provider_reference is not null;
create index if not exists payments_owner_created on public.payments(user_id,created_at desc);
create index if not exists payments_status_created on public.payments(status,created_at);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('paddle','paypro')),
  external_subscription_id text,
  external_customer_id text,
  plan_id text not null references public.billing_plans(id),
  status text not null check (status in ('active','past_due','paused','cancelled','expired')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists subscriptions_external_unique
  on public.subscriptions(provider,external_subscription_id) where external_subscription_id is not null;
create index if not exists subscriptions_owner_end on public.subscriptions(user_id,current_period_end desc);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('paddle','paypro')),
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error text,
  unique(provider,event_id)
);

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.billing_discounts(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique(discount_id,payment_id)
);
create index if not exists discount_redemptions_owner on public.discount_redemptions(discount_id,user_id);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  idempotency_key text not null unique,
  to_email text not null,
  template text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists email_outbox_pending on public.email_outbox(status,created_at) where status in ('pending','failed');

create table if not exists public.site_creatives (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','image/gif')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  alt_text text not null default '' check (length(alt_text)<=300),
  title text not null default '' check (length(title)<=160),
  location text not null check (location in ('banner','image_template','video_template')),
  template_prompt text not null default '' check (length(template_prompt)<=6000),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_creatives_public_location on public.site_creatives(location,is_active,sort_order);

alter table public.billing_plans enable row level security;
alter table public.billing_discounts enable row level security;
alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.email_outbox enable row level security;
alter table public.site_creatives enable row level security;

create policy "public read active plans" on public.billing_plans
  for select to anon,authenticated using (active=true or id='free');
create policy "public read active creatives" on public.site_creatives
  for select to anon,authenticated using (is_active=true);

revoke all on public.billing_plans from public,anon,authenticated;
revoke all on public.billing_discounts from public,anon,authenticated;
revoke all on public.payments from public,anon,authenticated;
revoke all on public.subscriptions from public,anon,authenticated;
revoke all on public.webhook_events from public,anon,authenticated;
revoke all on public.discount_redemptions from public,anon,authenticated;
revoke all on public.email_outbox from public,anon,authenticated;
revoke all on public.site_creatives from public,anon,authenticated;
grant select on public.billing_plans to anon,authenticated;
grant select on public.site_creatives to anon,authenticated;
grant all on public.billing_plans to service_role;
grant all on public.billing_discounts to service_role;
grant all on public.payments to service_role;
grant all on public.subscriptions to service_role;
grant all on public.webhook_events to service_role;
grant all on public.discount_redemptions to service_role;
grant all on public.email_outbox to service_role;
grant all on public.site_creatives to service_role;

-- The public bucket allows public reads; writes are made only by server-side admin routes using service_role.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-banners','site-banners',true,10485760,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "public read active site creatives" on storage.objects;
create policy "public read site banners" on storage.objects
  for select to anon,authenticated using (bucket_id='site-banners');

create or replace function public.apply_paid_payment(
  p_payment uuid,
  p_provider_reference text,
  p_paid_amount numeric,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_plan public.billing_plans;
  v_balance bigint;
  v_subscription uuid;
  v_start timestamptz := now();
  v_end timestamptz;
begin
  select * into v_payment from public.payments where id=p_payment for update;
  if not found then raise exception 'payment_not_found' using errcode='P0002'; end if;
  if v_payment.status='paid' then
    return jsonb_build_object('status','paid','duplicate',true,'userId',v_payment.user_id,'planId',v_payment.plan_id);
  end if;
  if v_payment.status<>'pending' then raise exception 'payment_not_pending' using errcode='40001'; end if;
  if upper(p_currency)<>v_payment.currency or round(p_paid_amount,2)<>round(v_payment.amount,2) then
    raise exception 'payment_amount_mismatch' using errcode='22023';
  end if;
  select * into v_plan from public.billing_plans where id=v_payment.plan_id and active=true;
  if not found then raise exception 'billing_plan_inactive' using errcode='22023'; end if;
  if p_provider_reference is null or length(p_provider_reference)>250 then
    raise exception 'invalid_provider_reference' using errcode='22023';
  end if;

  v_end := v_start + make_interval(days => v_plan.period_days);
  v_balance := public.grant_credits(v_payment.user_id,v_payment.credits_to_grant,'purchase:'||v_payment.provider||':'||v_payment.id::text);
  update public.profiles set plan=v_payment.plan_id where id=v_payment.user_id;
  update public.payments
    set status='paid',provider_reference=coalesce(provider_reference,p_provider_reference),
        paid_at=now(),updated_at=now()
    where id=p_payment;

  insert into public.subscriptions(user_id,provider,plan_id,status,current_period_start,current_period_end,external_subscription_id,external_customer_id,metadata)
    values(v_payment.user_id,v_payment.provider,v_payment.plan_id,'active',v_start,v_end,
      nullif(v_payment.metadata->>'subscription_id',''),nullif(v_payment.metadata->>'customer_id',''),
      jsonb_build_object('payment_id',p_payment))
    returning id into v_subscription;

  if v_payment.discount_id is not null then
    insert into public.discount_redemptions(discount_id,user_id,payment_id)
    values(v_payment.discount_id,v_payment.user_id,p_payment)
    on conflict(discount_id,payment_id) do nothing;
  end if;

  return jsonb_build_object('status','paid','duplicate',false,'userId',v_payment.user_id,
    'planId',v_payment.plan_id,'creditsGranted',v_payment.credits_to_grant,'balance',v_balance,
    'subscriptionId',v_subscription,'periodEnd',v_end);
end;
$$;

create or replace function public.expire_billing_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; n integer := 0;
begin
  for r in select id,user_id from public.subscriptions
    where status='active' and current_period_end<=now() and cancel_at_period_end=true
    for update skip locked loop
    update public.subscriptions set status='expired',updated_at=now() where id=r.id;
    update public.profiles set plan='free' where id=r.user_id
      and not exists(select 1 from public.subscriptions s where s.user_id=r.user_id and s.status='active' and s.current_period_end>now());
    n := n+1;
  end loop;
  return n;
end;
$$;

revoke all on function public.apply_paid_payment(uuid,text,numeric,text) from public,anon,authenticated;
revoke all on function public.expire_billing_subscriptions() from public,anon,authenticated;
grant execute on function public.apply_paid_payment(uuid,text,numeric,text) to service_role;
grant execute on function public.expire_billing_subscriptions() to service_role;

commit;
