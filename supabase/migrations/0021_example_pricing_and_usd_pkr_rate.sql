-- 0021 - Example PKR pricing and initial USD/PKR reference rate.
-- Paid plans remain inactive until a payment provider is fully configured.
begin;

update public.billing_plans
set name='Free',
    description='A free starting point for everyday AI help.',
    currency='PKR',
    price_amount=0,
    credits_per_period=0,
    period_days=30,
    active=true,
    paypro_enabled=false,
    paddle_price_id=null,
    paddle_product_id=null,
    sort_order=0,
    display_features='["500 welcome credits on sign-up","100 free credits refreshed daily","Core AI chat and conversation history","Access to free-tier AI models"]'::jsonb,
    updated_at=now()
where id='free';

update public.billing_plans
set name='Pro',
    description='More room for regular study, work and creation.',
    currency='PKR',
    price_amount=799,
    credits_per_period=12000,
    period_days=30,
    active=false,
    paypro_enabled=false,
    paddle_price_id=null,
    paddle_product_id=null,
    sort_order=1,
    display_features='["12,000 AI credits per 30-day period","Access to Pro-tier AI models where enabled","Expanded usage for chat and productivity tools","File and education workflows","A good fit for regular daily use"]'::jsonb,
    updated_at=now()
where id='pro';

update public.billing_plans
set name='Elite',
    description='Higher limits for power users and advanced workflows.',
    currency='PKR',
    price_amount=1499,
    credits_per_period=30000,
    period_days=30,
    active=false,
    paypro_enabled=false,
    paddle_price_id=null,
    paddle_product_id=null,
    sort_order=2,
    display_features='["30,000 AI credits per 30-day period","Access to Elite-tier AI models where enabled","Higher usage limits","Advanced creation and productivity tools","Built for heavier daily use"]'::jsonb,
    updated_at=now()
where id='elite';

insert into public.app_settings(key,value,updated_at)
values(
  'usd_pkr_rate',
  '{"usdToPkr":276.51,"base":"USD","target":"PKR","mode":"auto","lastUpdated":null,"fetchedAt":null,"fetchedRate":null,"source":"preview"}'::jsonb,
  now()
)
on conflict(key) do nothing;

commit;
