-- 0019 - Settle already-created purchases even if an admin later hides/deactivates the plan.
begin;

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
  v_external_subscription text;
  v_period_start timestamptz;
  v_period_end timestamptz;
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
  select * into v_plan from public.billing_plans where id=v_payment.plan_id;
  if not found then raise exception 'billing_plan_inactive' using errcode='22023'; end if;
  if p_provider_reference is null or length(p_provider_reference)>250 then
    raise exception 'invalid_provider_reference' using errcode='22023';
  end if;

  v_external_subscription := nullif(v_payment.metadata->>'subscription_id','');
  v_period_start := nullif(v_payment.metadata->>'period_start','')::timestamptz;
  v_period_end := nullif(v_payment.metadata->>'period_end','')::timestamptz;
  v_start := coalesce(v_period_start,now());
  v_end := coalesce(v_period_end,v_start + make_interval(days => v_plan.period_days));
  if v_end<=v_start then raise exception 'invalid_subscription_period' using errcode='22023'; end if;

  v_balance := public.grant_credits(v_payment.user_id,v_payment.credits_to_grant,
    'purchase:'||v_payment.provider||':'||v_payment.id::text);
  update public.profiles set plan=v_payment.plan_id where id=v_payment.user_id;
  update public.payments
    set status='paid',provider_reference=coalesce(provider_reference,p_provider_reference),
        paid_at=now(),updated_at=now()
    where id=p_payment;

  if v_external_subscription is null then
    insert into public.subscriptions(
      user_id,provider,plan_id,status,current_period_start,current_period_end,
      external_customer_id,cancel_at_period_end,metadata
    ) values (
      v_payment.user_id,v_payment.provider,v_payment.plan_id,'active',v_start,v_end,
      nullif(v_payment.metadata->>'customer_id',''),true,jsonb_build_object('payment_id',p_payment)
    ) returning id into v_subscription;
  else
    insert into public.subscriptions(
      user_id,provider,external_subscription_id,plan_id,status,current_period_start,current_period_end,
      external_customer_id,cancel_at_period_end,metadata
    ) values (
      v_payment.user_id,v_payment.provider,v_external_subscription,v_payment.plan_id,'active',v_start,v_end,
      nullif(v_payment.metadata->>'customer_id',''),false,jsonb_build_object('payment_id',p_payment)
    )
    on conflict(provider,external_subscription_id) where external_subscription_id is not null
    do update set
      user_id=excluded.user_id,plan_id=excluded.plan_id,status='active',
      current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
      external_customer_id=coalesce(excluded.external_customer_id,public.subscriptions.external_customer_id),
      cancel_at_period_end=false,metadata=coalesce(public.subscriptions.metadata,'{}'::jsonb)||excluded.metadata,
      updated_at=now()
    returning id into v_subscription;
  end if;

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

commit;
