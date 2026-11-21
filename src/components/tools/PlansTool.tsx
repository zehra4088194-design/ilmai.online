'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, CreditCard, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useApp } from '@/components/chat/AppShell';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

type Plan={
  id:string;name:string;description:string;currency:string;price_amount:number;
  credits_per_period:number;period_days:number;display_features:string[];
  paddleAvailable:boolean;payproAvailable:boolean;
};
type Payment={
  id:string;provider:string;plan_id:string;amount:number;currency:string;status:string;
  created_at:string;paid_at:string|null;provider_reference:string|null;
};
type Subscription={
  id:string;provider:string;plan_id:string;status:string;current_period_start:string;
  current_period_end:string;cancel_at_period_end:boolean;external_subscription_id:string|null;
};

export function PlansTool(){
  const {user,refreshMe}=useApp();
  const toast=useToast();
  const [plans,setPlans]=useState<Plan[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
  const [discountCode,setDiscountCode]=useState('');
  const [name,setName]=useState(user.name);
  const [mobile,setMobile]=useState('');
  const [paymentType,setPaymentType]=useState<'jazzcash'|'easypaisa'>('jazzcash');
  const [busy,setBusy]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const refresh=useCallback(async()=>{
    const [p,h,s]=await Promise.all([
      api<{plans:Plan[]}>('/api/billing/plans','GET'),
      api<{payments:Payment[]}>('/api/billing/payments','GET'),
      api<{subscriptions:Subscription[]}>('/api/billing/subscription','GET'),
    ]);
    setPlans(p.plans??[]);setPayments(h.payments??[]);setSubscriptions(s.subscriptions??[]);
  },[]);
  useEffect(()=>{refresh().catch(e=>setError(e instanceof Error?e.message:'Could not load plans')).finally(()=>setLoading(false));},[refresh]);

  async function checkout(plan:Plan,provider:'paddle'|'paypro'){
    if(busy)return;
    if(provider==='paypro'&&(!name.trim()||!mobile.trim())){setError('Enter the account holder name and JazzCash/EasyPaisa mobile number.');return;}
    setBusy(plan.id+provider);setError('');
    try{
      if(provider==='paddle'){
        const result=await api<{checkoutUrl:string}>('/api/billing/paddle/checkout','POST',{
          requestId:crypto.randomUUID(),planId:plan.id,discountCode:discountCode.trim()||undefined,
        });
        window.location.assign(result.checkoutUrl);
      }else{
        const result=await api<{paymentId:string;tradeNo:string;message:string}>('/api/billing/paypro/checkout','POST',{
          requestId:crypto.randomUUID(),planId:plan.id,paymentType,name,mobile,email:user.email,
          discountCode:discountCode.trim()||undefined,
        });
        toast('Payment request sent. Approve it on your mobile wallet.','ok');
        await refresh();
        await checkPayPro(result.paymentId);
      }
    }catch(e){setError(e instanceof Error?e.message:'Checkout could not be started');}
    finally{setBusy('');}
  }

  async function checkPayPro(paymentId:string){
    setBusy(paymentId);setError('');
    try{
      const result=await api<{status:string;message?:string}>('/api/billing/paypro/status','POST',{paymentId});
      await refresh();await refreshMe();
      if(result.status==='paid')toast('Payment verified. Your plan and credits have been updated.','ok');
      else if(result.status==='pending')toast('Still waiting for wallet approval. Check again after approving the request.','info');
      else toast('Payment status: '+result.status,'info');
    }catch(e){setError(e instanceof Error?e.message:'Could not check payment');}
    finally{setBusy('');}
  }

  async function cancel(subscription:Subscription,immediate=false){
    const wording=immediate?'Cancel this subscription immediately? Access may end now.':'Schedule cancellation at the end of the current billing period?';
    if(!window.confirm(wording))return;
    setBusy(subscription.id);setError('');
    try{
      await api('/api/billing/subscription','POST',{
        subscriptionId:subscription.id,effectiveFrom:immediate?'immediately':'next_billing_period',
      });
      await refresh();await refreshMe();
      toast(immediate?'Subscription cancelled':'Cancellation scheduled for the end of the billing period','ok');
    }catch(e){setError(e instanceof Error?e.message:'Could not cancel subscription');}
    finally{setBusy('');}
  }

  if(loading)return <div className="card p-8 text-center text-sm text-muted-foreground">Loading plans…</div>;
  return <div className="space-y-6">
    <section className="glass space-y-3 rounded-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">Your Ilm AI plan</h2><p className="mt-1 text-sm text-muted-foreground">Current plan: <strong className="capitalize">{user.plan}</strong> · {user.credits.toLocaleString()} credits remaining</p></div><button className="btn-outline text-xs" onClick={()=>Promise.all([refresh(),refreshMe()]).catch(e=>setError(e.message))}><RefreshCw className="h-4 w-4"/>Refresh</button></div>
      <label className="block space-y-1 text-sm font-medium">Discount code<input className="input" value={discountCode} maxLength={40} onChange={(e)=>setDiscountCode(e.target.value.toUpperCase())} placeholder="Enter a coupon code (optional)"/></label>
      <p className="text-xs text-muted-foreground">Discount eligibility and final price are checked on the server when checkout starts.</p>
    </section>

    <section className="grid gap-3 lg:grid-cols-3">
      {plans.map((plan)=>(
        <article key={plan.id} className="card flex flex-col gap-4 p-5">
          <div><h3 className="text-xl font-extrabold">{plan.name}</h3><p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p></div>
          <div><p className="text-3xl font-extrabold tabular-nums">{plan.currency} {Number(plan.price_amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p><p className="text-xs text-muted-foreground">Every {plan.period_days} days · {Number(plan.credits_per_period).toLocaleString()} credits</p></div>
          <ul className="flex-1 space-y-2 text-sm">{plan.display_features.map((item,i)=><li key={i} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>{item}</li>)}</ul>
          {plan.id==='free'?<span className="badge self-start">{user.plan==='free'?'Your current plan':'Free plan'}</span>:(
            <div className="space-y-2">
              {plan.paddleAvailable&&<button className="btn-primary w-full" disabled={!!busy||user.plan===plan.id} onClick={()=>checkout(plan,'paddle')}><CreditCard className="h-4 w-4"/>{busy===plan.id+'paddle'?'Opening checkout…':'Pay securely with Paddle'}</button>}
              {plan.payproAvailable&&<button className="btn-outline w-full" disabled={!!busy||user.plan===plan.id} onClick={()=>checkout(plan,'paypro')}><Wallet className="h-4 w-4"/>{busy===plan.id+'paypro'?'Sending request…':'JazzCash / Easypaisa'}</button>}
              {!plan.paddleAvailable&&!plan.payproAvailable&&<span className="block rounded-xl bg-muted p-3 text-xs text-muted-foreground">Checkout is not configured for this plan yet.</span>}
              {user.plan===plan.id&&<span className="block text-center text-xs text-muted-foreground">Your current plan</span>}
            </div>
          )}
        </article>
      ))}
    </section>

    {plans.some((p)=>p.payproAvailable)&&<section className="card space-y-3 p-4">
      <div><h3 className="font-bold">JazzCash / Easypaisa account</h3><p className="text-xs text-muted-foreground">PayPro sends an approval request to the mobile wallet account. Use the same number linked to your wallet.</p></div>
      <label className="block space-y-1 text-sm font-medium">Account holder name<input className="input" value={name} onChange={(e)=>setName(e.target.value)} maxLength={100}/></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">Mobile number<input className="input" value={mobile} onChange={(e)=>setMobile(e.target.value)} placeholder="03XXXXXXXXX" maxLength={16}/></label>
        <label className="space-y-1 text-sm font-medium">Wallet<select className="input" value={paymentType} onChange={(e)=>setPaymentType(e.target.value as typeof paymentType)}><option value="jazzcash">JazzCash</option><option value="easypaisa">Easypaisa</option></select></label>
      </div>
      <p className="text-xs text-muted-foreground">Email used for receipts: {user.email}</p>
    </section>}

    {subscriptions.length>0&&<section className="card space-y-3 p-4">
      <h3 className="font-bold">Subscriptions</h3>
      {subscriptions.map((subscription)=>(
        <div key={subscription.id} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <div className="min-w-0 flex-1"><p className="font-semibold capitalize">{subscription.plan_id} · {subscription.provider}</p><p className="text-xs text-muted-foreground capitalize">{subscription.status} · Ends {new Date(subscription.current_period_end).toLocaleDateString()}{subscription.cancel_at_period_end?' · cancellation scheduled':''}</p></div>
          {subscription.provider==='paddle'&&subscription.status==='active'&&!subscription.cancel_at_period_end&&<button className="btn-outline text-xs" disabled={!!busy} onClick={()=>cancel(subscription)}>{busy===subscription.id?'Working…':'Cancel at period end'}</button>}
        </div>
      ))}
    </section>}

    <section className="card space-y-3 p-4">
      <div><h3 className="font-bold">Payment history</h3><p className="text-xs text-muted-foreground">Wallet payments stay pending until PayPro confirms the actual transaction.</p></div>
      {payments.length===0?<p className="text-sm text-muted-foreground">No payments yet.</p>:payments.map((payment)=>(
        <div key={payment.id} className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
          <div className="min-w-0 flex-1"><p className="font-semibold capitalize">{payment.plan_id} · {payment.provider}</p><p className="text-xs text-muted-foreground">{new Date(payment.created_at).toLocaleString()} · {payment.currency} {payment.amount}</p></div>
          <span className="badge capitalize">{payment.status}</span>
          {payment.provider==='paypro'&&payment.status==='pending'&&<button className="btn-outline text-xs" disabled={!!busy} onClick={()=>checkPayPro(payment.id)}>{busy===payment.id?'Checking…':'Check status'}</button>}
        </div>
      ))}
    </section>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4"/>Your plan and credits change only after a verified payment notification or provider status response.</p>
    <nav className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
      <a href="/privacy" className="hover:text-foreground">Privacy</a>
      <a href="/terms" className="hover:text-foreground">Terms</a>
      <a href="/refunds" className="hover:text-foreground">Refunds & cancellation</a>
      <a href="/cookies" className="hover:text-foreground">Cookies</a>
      <a href="/acceptable-use" className="hover:text-foreground">Acceptable use</a>
      <a href="/contact" className="hover:text-foreground">Support</a>
    </nav>
    {error&&<p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
  </div>;
}
