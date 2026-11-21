'use client';

import { useState } from 'react';
import { Plus, Save, Trash2, CreditCard, Wallet, History } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

type Plan={
  id:'free'|'pro'|'elite';name:string;description:string;currency:'PKR'|'USD';
  price_amount:number;credits_per_period:number;period_days:number;
  paddle_price_id:string|null;paddle_product_id:string|null;paypro_enabled:boolean;
  active:boolean;display_features:string[];sort_order:number;
};
type Discount={
  id:string;code:string;description:string;discount_type:'percent'|'fixed';
  value:number;currency:string|null;paddle_discount_id:string|null;active:boolean;
  max_redemptions:number|null;per_user_limit:number;starts_at:string|null;ends_at:string|null;
};
type Payment={
  id:string;user_id?:string;customer_email?:string|null;provider:string;plan_id:string;
  amount:number;currency:string;status:string;created_at:string;paid_at?:string|null;
};
type Data={
  plans:Plan[];discounts:Discount[];payments:Payment[];
  providers:{paddleConfigured:boolean;payproConfigured:boolean};
};

function dateLabel(value:string){return new Date(value).toLocaleString();}
function money(value:number,currency:string){return new Intl.NumberFormat('en-PK',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value)||0);}

export function BillingAdmin({initial}:{initial:Data}) {
  const [data,setData]=useState(initial);
  const [discount,setDiscount]=useState({
    code:'',description:'',discount_type:'percent' as 'percent'|'fixed',value:10,
    currency:'PKR' as 'PKR'|'USD',paddle_discount_id:'',active:true,max_redemptions:'',per_user_limit:1,
  });
  const [busy,setBusy]=useState('');
  const toast=useToast();

  async function save(plan:Plan) {
    setBusy(plan.id);
    try {
      await api('/api/admin/billing','PATCH',plan);
      toast(plan.name+' saved','ok');
    }catch(e){toast(e instanceof Error?e.message:'Could not save plan','err');}
    finally{setBusy('');}
  }
  function change<K extends keyof Plan>(id:Plan['id'],key:K,value:Plan[K]) {
    setData((old)=>({...old,plans:old.plans.map((plan)=>plan.id===id?{...plan,[key]:value}:plan)}));
  }
  async function addDiscount(event:React.FormEvent) {
    event.preventDefault();
    setBusy('discount');
    try {
      const result=await api<{discount:Discount}>('/api/admin/billing','POST',{
        ...discount,code:discount.code.toUpperCase(),
        max_redemptions:discount.max_redemptions===''?null:Number(discount.max_redemptions),
        currency:discount.discount_type==='percent'?null:discount.currency,
        paddle_discount_id:discount.paddle_discount_id.trim()||null,
      });
      setData((old)=>({...old,discounts:[result.discount,...old.discounts]}));
      setDiscount((old)=>({...old,code:'',description:'',paddle_discount_id:''}));
      toast('Discount created','ok');
    }catch(e){toast(e instanceof Error?e.message:'Could not create discount','err');}
    finally{setBusy('');}
  }
  async function deleteDiscount(item:Discount) {
    if(!window.confirm('Delete discount '+item.code+'?'))return;
    try {
      await api('/api/admin/billing','DELETE',{id:item.id});
      setData((old)=>({...old,discounts:old.discounts.filter((x)=>x.id!==item.id)}));
      toast('Discount deleted','ok');
    }catch(e){toast(e instanceof Error?e.message:'Could not delete discount','err');}
  }

  return <div className="space-y-6">
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Payment provider connections</h2>
      <p className="text-xs text-muted-foreground">Keys stay in Coolify server secrets. Never paste API secrets into these plan fields.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-border p-3">
          <CreditCard className="mt-0.5 h-5 w-5 text-primary"/>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Paddle <span className="ml-1 text-xs font-normal">{data.providers.paddleConfigured?'Configured':'Not configured'}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">USD plans · API key, webhook secret and sandbox/production environment</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border p-3">
          <Wallet className="mt-0.5 h-5 w-5 text-primary"/>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">PayPro <span className="ml-1 text-xs font-normal">{data.providers.payproConfigured?'Configured':'Not configured'}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">PKR plans · merchant number, app secret and API base URL</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Webhook endpoints: <code>/api/webhooks/paddle</code> and <code>/api/webhooks/paypro</code></p>
    </section>

    <section className="space-y-3">
      <div><h2 className="text-lg font-bold">Plan catalogue</h2><p className="text-sm text-muted-foreground">Public pricing, the checkout amount and credits granted after a verified payment are read from these saved plan records.</p></div>
      {data.plans.map((plan)=>{
        const paddleReady=data.providers.paddleConfigured&&plan.currency==='USD'&&!!plan.paddle_price_id;
        const payproReady=data.providers.payproConfigured&&plan.currency==='PKR'&&plan.paypro_enabled;
        return <article key={plan.id} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-bold">{plan.name} <span className="badge">{plan.id}</span></h3><p className="text-xs text-muted-foreground">Saved price: {money(plan.price_amount,plan.currency)} · {Number(plan.credits_per_period).toLocaleString()} credits per {plan.period_days} days</p></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan.active} onChange={(e)=>change(plan.id,'active',e.target.checked)}/>Active on pricing page</label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium">Display name<input className="input mt-1" value={plan.name} onChange={(e)=>change(plan.id,'name',e.target.value)}/></label>
            <label className="text-xs font-medium">Currency<select className="input mt-1" value={plan.currency} onChange={(e)=>change(plan.id,'currency',e.target.value as Plan['currency'])}><option>PKR</option><option>USD</option></select></label>
            <label className="text-xs font-medium">Price (major units)<input className="input mt-1" type="number" min={0} step="0.01" value={plan.price_amount} onChange={(e)=>change(plan.id,'price_amount',Number(e.target.value))}/></label>
            <label className="text-xs font-medium">AI credits per period<input className="input mt-1" type="number" min={0} value={plan.credits_per_period} onChange={(e)=>change(plan.id,'credits_per_period',Number(e.target.value))}/></label>
            <label className="text-xs font-medium">Period (days)<input className="input mt-1" type="number" min={1} max={366} value={plan.period_days} onChange={(e)=>change(plan.id,'period_days',Number(e.target.value))}/></label>
            <label className="text-xs font-medium">Paddle Price ID<input className="input mt-1" value={plan.paddle_price_id??''} onChange={(e)=>change(plan.id,'paddle_price_id',e.target.value||null)} placeholder="pri_…"/></label>
            <label className="text-xs font-medium">Paddle Product ID<input className="input mt-1" value={plan.paddle_product_id??''} onChange={(e)=>change(plan.id,'paddle_product_id',e.target.value||null)} placeholder="pro_…"/></label>
            <label className="text-xs font-medium">Sort order<input className="input mt-1" type="number" min={0} value={plan.sort_order} onChange={(e)=>change(plan.id,'sort_order',Number(e.target.value))}/></label>
          </div>
          <label className="block text-xs font-medium">Description<textarea className="input mt-1 min-h-16" value={plan.description} onChange={(e)=>change(plan.id,'description',e.target.value)}/></label>
          <label className="block text-xs font-medium">Features (one per line)<textarea className="input mt-1 min-h-20" value={plan.display_features.join('\n')} onChange={(e)=>change(plan.id,'display_features',e.target.value.split('\n').map((x)=>x.trim()).filter(Boolean))}/></label>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan.paypro_enabled} onChange={(e)=>change(plan.id,'paypro_enabled',e.target.checked)}/>Enable PayPro for this PKR plan</label>
            <span className="text-xs text-muted-foreground">Paddle: {paddleReady?'ready':'not ready'} · PayPro: {payproReady?'ready':'not ready'}</span>
            <button className="btn-primary ml-auto" disabled={busy===plan.id} onClick={()=>save(plan)}><Save className="h-4 w-4"/>Save {plan.name}</button>
          </div>
        </article>;
      })}
    </section>

    <section className="card space-y-4 p-4">
      <div><h2 className="font-bold">Create discount code</h2><p className="text-xs text-muted-foreground">For Paddle, the Paddle discount ID must match the discount type and value configured here.</p></div>
      <form onSubmit={addDiscount} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Code<input className="input mt-1" maxLength={40} value={discount.code} onChange={(e)=>setDiscount({...discount,code:e.target.value})} required/></label>
        <label className="text-xs font-medium">Type<select className="input mt-1" value={discount.discount_type} onChange={(e)=>setDiscount({...discount,discount_type:e.target.value as 'percent'|'fixed'})}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label>
        <label className="text-xs font-medium">Value<input className="input mt-1" type="number" min={0.01} step="0.01" value={discount.value} onChange={(e)=>setDiscount({...discount,value:Number(e.target.value)})}/></label>
        {discount.discount_type==='fixed'&&<label className="text-xs font-medium">Currency<select className="input mt-1" value={discount.currency} onChange={(e)=>setDiscount({...discount,currency:e.target.value as 'PKR'|'USD'})}><option>PKR</option><option>USD</option></select></label>}
        <label className="text-xs font-medium sm:col-span-2">Paddle Discount ID (optional)<input className="input mt-1" value={discount.paddle_discount_id} onChange={(e)=>setDiscount({...discount,paddle_discount_id:e.target.value})} placeholder="dsc_…"/></label>
        <label className="text-xs font-medium">Max redemptions<input className="input mt-1" type="number" min={1} value={discount.max_redemptions} onChange={(e)=>setDiscount({...discount,max_redemptions:e.target.value})} placeholder="Unlimited"/></label>
        <label className="text-xs font-medium">Per-user limit<input className="input mt-1" type="number" min={1} max={20} value={discount.per_user_limit} onChange={(e)=>setDiscount({...discount,per_user_limit:Number(e.target.value)})}/></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={discount.active} onChange={(e)=>setDiscount({...discount,active:e.target.checked})}/>Active</label>
        <label className="text-xs font-medium sm:col-span-2">Description<input className="input mt-1" value={discount.description} onChange={(e)=>setDiscount({...discount,description:e.target.value})}/></label>
        <button className="btn-primary sm:col-span-2" disabled={busy==='discount'||!discount.code.trim()}><Plus className="h-4 w-4"/>Create discount</button>
      </form>
      <div className="space-y-2 border-t border-border pt-3">
        {data.discounts.map((item)=><div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="badge">{item.code}</span>
          <span className="min-w-0 flex-1">{item.discount_type==='percent'?item.value+'%':item.value+' '+item.currency} · {item.active?'active':'inactive'}{item.paddle_discount_id?' · Paddle linked':' · no Paddle ID'}</span>
          <button className="btn-ghost text-danger" onClick={()=>deleteDiscount(item)}><Trash2 className="h-4 w-4"/>Delete</button>
        </div>)}
        {data.discounts.length===0&&<p className="text-xs text-muted-foreground">No discount codes yet.</p>}
      </div>
    </section>

    <section className="card space-y-3 p-4">
      <div className="flex items-center gap-2"><History className="h-5 w-5 text-primary"/><h2 className="font-bold">Recent payments</h2></div>
      {data.payments.length===0?<p className="text-sm text-muted-foreground">No payments recorded yet.</p>:<div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead><tr className="border-b border-border text-muted-foreground"><th className="p-2">Date</th><th className="p-2">User</th><th className="p-2">Plan</th><th className="p-2">Provider</th><th className="p-2">Amount</th><th className="p-2">Status</th></tr></thead>
          <tbody>{data.payments.map((payment)=><tr key={payment.id} className="border-b border-border/60">
            <td className="p-2">{dateLabel(payment.created_at)}</td><td className="p-2">{payment.customer_email??payment.user_id??'—'}</td><td className="p-2 capitalize">{payment.plan_id}</td>
            <td className="p-2 uppercase">{payment.provider}</td><td className="p-2 tabular-nums">{money(payment.amount,payment.currency)}</td><td className="p-2 capitalize">{payment.status}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
