import type { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { handle, HttpError, json } from '@/lib/http';
import { adminClient } from '@/lib/supabase/admin';
import { completePayment } from '@/lib/billing-settlement';

export const runtime='nodejs';
export const dynamic='force-dynamic';

type PaddleEvent = {
  event_id?:string;event_type?:string;occurred_at?:string;
  data?:Record<string,unknown>;
};

function verifyPaddle(raw:string,header:string,secret:string) {
  const parts=new Map<string,string[]>();
  for(const part of header.split(';')) {
    const [key,...values]=part.split('=');
    if(!key||!values.length) continue;
    const old=parts.get(key)??[];
    old.push(values.join('='));
    parts.set(key,old);
  }
  const timestamp=parts.get('ts')?.[0]??'';
  const signatures=parts.get('h1')??[];
  const ts=Number(timestamp);
  if(!Number.isSafeInteger(ts)||!signatures.length||Math.abs(Date.now()-ts*1000)>5000) return false;
  const expected=createHmac('sha256',secret).update(timestamp+':'+raw,'utf8').digest();
  return signatures.some((signature)=>{
    let provided:Buffer;
    try{provided=Buffer.from(signature,'hex');}catch{return false;}
    return provided.length===expected.length&&timingSafeEqual(provided,expected);
  });
}

function moneyFromPaddle(value:unknown,currency:string) {
  const raw=typeof value==='string'?value:typeof value==='number'?String(value):'';
  if(!/^\d+(\.\d+)?$/.test(raw)) throw new HttpError(400,'Paddle transaction has an invalid amount');
  // Paddle totals are in the currency's smallest unit (e.g. cents for USD).
  const zeroDecimal=new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);
  const exponent=zeroDecimal.has(currency.toUpperCase())?0:2;
  const scale=10**exponent;
  const number=Number(raw)/scale;
  if(!Number.isFinite(number)) throw new HttpError(400,'Paddle amount is invalid');
  return Math.round(number*100)/100;
}

function iso(value:unknown) {
  if(typeof value!=='string') return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

export const POST=handle(async(req:NextRequest)=>{
  const secret=process.env.PADDLE_WEBHOOK_SECRET;
  if(!secret) throw new HttpError(503,'Paddle webhook secret is not configured','paddle_webhook_unconfigured');
  const raw=await req.text();
  const signature=req.headers.get('paddle-signature')??'';
  if(!verifyPaddle(raw,signature,secret)) throw new HttpError(401,'Invalid Paddle webhook signature','invalid_paddle_signature');
  if(raw.length>1024*1024) throw new HttpError(413,'Webhook body is too large');
  let event:PaddleEvent;
  try{event=JSON.parse(raw) as PaddleEvent;}catch{throw new HttpError(400,'Invalid Paddle event JSON');}
  if(!event.event_id||!event.event_type||!event.data) throw new HttpError(400,'Incomplete Paddle webhook event');

  const db=adminClient();
  const eventRow={
    provider:'paddle',event_id:event.event_id,event_type:event.event_type,
    status:'received',error:null,
  };
  const inserted=await db.from('webhook_events').insert(eventRow).select('id').maybeSingle();
  let eventRecordId=inserted.data?.id as string|undefined;
  if(inserted.error) {
    if(inserted.error.code!=='23505') throw inserted.error;
    const existing=await db.from('webhook_events').select('id,status').eq('provider','paddle').eq('event_id',event.event_id).maybeSingle();
    if(existing.error) throw existing.error;
    if(!existing.data) throw inserted.error;
    if(existing.data.status==='processed'||existing.data.status==='ignored') return json({received:true,duplicate:true});
    eventRecordId=existing.data.id;
    const reset=await db.from('webhook_events').update({status:'received',error:null}).eq('id',eventRecordId).in('status',['failed','received']);
    if(reset.error) throw reset.error;
  }

  try{
    const data=event.data;
    const type=event.event_type;
    if(type==='transaction.completed'||type==='transaction.paid') {
      const transactionId=String(data.id??'');
      const custom=(data.custom_data&&typeof data.custom_data==='object'?data.custom_data:{}) as Record<string,unknown>;
      const suppliedPaymentId=typeof custom.payment_id==='string'?custom.payment_id:null;
      const subscriptionId=typeof data.subscription_id==='string'?data.subscription_id:null;
      const customerId=typeof data.customer_id==='string'?data.customer_id:null;
      const currency=String(data.currency_code??'').toUpperCase();
      const total=(data.details as Record<string,unknown>|undefined)?.totals as Record<string,unknown>|undefined;
      const grandTotal=total?.grand_total??total?.total;
      const amount=moneyFromPaddle(grandTotal,currency);
      if(!transactionId) throw new Error('Paddle transaction ID is missing');

      let payment:Record<string,any>|null=null;
      const byReference=await db.from('payments').select('*').eq('provider','paddle').eq('provider_reference',transactionId).maybeSingle();
      if(byReference.error) throw byReference.error;
      if(byReference.data) payment=byReference.data;

      if(!payment&&suppliedPaymentId) {
        const supplied=await db.from('payments').select('*').eq('id',suppliedPaymentId).eq('provider','paddle').maybeSingle();
        if(supplied.error) throw supplied.error;
        if(supplied.data) payment=supplied.data;
      }

      if(!payment&&subscriptionId) {
        const subscription=await db.from('subscriptions').select('user_id,plan_id')
          .eq('provider','paddle').eq('external_subscription_id',subscriptionId).maybeSingle();
        if(subscription.error) throw subscription.error;
        if(subscription.data) {
          const plan=await db.from('billing_plans').select('credits_per_period,paddle_price_id,currency')
            .eq('id',subscription.data.plan_id).single();
          if(plan.error) throw plan.error;
          const renewal=await db.from('payments').insert({
            user_id:subscription.data.user_id,provider:'paddle',provider_reference:transactionId,
            plan_id:subscription.data.plan_id,amount,currency,
            credits_to_grant:Number(plan.data.credits_per_period),status:'pending',
            idempotency_key:'paddle-renewal:'+transactionId,
            metadata:{
              subscription_id:subscriptionId,customer_id:customerId,
              period_start:iso((data.billing_period as Record<string,unknown>|undefined)?.starts_at),
              period_end:iso((data.billing_period as Record<string,unknown>|undefined)?.ends_at),
            },
          }).select('*').single();
          if(renewal.error) {
            const prior=await db.from('payments').select('*').eq('provider','paddle').eq('provider_reference',transactionId).maybeSingle();
            if(prior.error||!prior.data) throw renewal.error;
            payment=prior.data;
          } else payment=renewal.data;
        }
      }
      if(!payment) throw new Error('No matching pending Paddle payment or subscription was found');

      const {data:plan,error:planError}=await db.from('billing_plans')
        .select('paddle_price_id,currency,active').eq('id',payment.plan_id).maybeSingle();
      if(planError) throw planError;
      if(!plan||!plan.paddle_price_id) throw new Error('The Paddle payment plan has no configured catalogue price');
      if(currency!==String(plan.currency).toUpperCase()) throw new Error('Paddle transaction currency does not match the configured plan');
      const items=Array.isArray(data.items)?data.items as Record<string,unknown>[]:[];
      const matchingItem=items.find((item)=>{
        const price=item.price&&typeof item.price==='object'?item.price as Record<string,unknown>:{};
        return price.id===plan.paddle_price_id && Number(item.quantity??1)===1;
      });
      if(!matchingItem) throw new Error('Paddle transaction does not contain the configured plan price and quantity');

      const metadata={
        ...(payment.metadata??{}),
        subscription_id:subscriptionId,customer_id:customerId,
        period_start:iso((data.billing_period as Record<string,unknown>|undefined)?.starts_at),
        period_end:iso((data.billing_period as Record<string,unknown>|undefined)?.ends_at),
      };
      const updated=await db.from('payments').update({
        amount,currency,provider_reference:transactionId,metadata,updated_at:new Date().toISOString(),
      }).eq('id',payment.id).eq('status','pending').select('id').maybeSingle();
      if(updated.error) throw updated.error;
      if(!updated.data) {
        const current=await db.from('payments').select('status').eq('id',payment.id).maybeSingle();
        if(current.error) throw current.error;
        if(current.data?.status!=='paid') throw new Error('Paddle payment is no longer pending');
      }
      await completePayment({paymentId:payment.id,providerReference:transactionId,amount,currency});
    } else if(type.startsWith('subscription.')) {
      const subscriptionId=String(data.id??'');
      if(!subscriptionId) throw new Error('Paddle subscription event has no subscription ID');
      const status=String(data.status??'');
      const billingPeriod=(data.current_billing_period&&typeof data.current_billing_period==='object'?data.current_billing_period:{}) as Record<string,unknown>;
      const scheduled=(data.scheduled_change&&typeof data.scheduled_change==='object'?data.scheduled_change:{}) as Record<string,unknown>;
      const cancelAtEnd=scheduled.action==='cancel';
      const state=status==='past_due'?'past_due':status==='paused'?'paused':status==='canceled'?'cancelled':'active';
      const update:Record<string,unknown>={
        status:state,
        cancel_at_period_end:cancelAtEnd,
        updated_at:new Date().toISOString(),
      };
      const start=iso(billingPeriod.starts_at),end=iso(billingPeriod.ends_at);
      if(start) update.current_period_start=start;
      if(end) update.current_period_end=end;
      const {data:subscription,error}=await db.from('subscriptions').update(update)
        .eq('provider','paddle').eq('external_subscription_id',subscriptionId)
        .select('user_id,status').maybeSingle();
      if(error) throw error;
      if(subscription?.status==='cancelled'||subscription?.status==='expired') {
        const {count,error:countError}=await db.from('subscriptions').select('id',{count:'exact',head:true})
          .eq('user_id',subscription.user_id).eq('status','active').gt('current_period_end',new Date().toISOString());
        if(countError) throw countError;
        if((count??0)===0) {
          const downgrade=await db.from('profiles').update({plan:'free'}).eq('id',subscription.user_id);
          if(downgrade.error) throw downgrade.error;
        }
      }
    }

    const mark=await db.from('webhook_events').update({
      status:event.event_type.startsWith('transaction.')||event.event_type.startsWith('subscription.')?'processed':'ignored',
      processed_at:new Date().toISOString(),error:null,
    }).eq('id',eventRecordId);
    if(mark.error) throw mark.error;
    return json({received:true});
  }catch(error){
    await db.from('webhook_events').update({
      status:'failed',error:error instanceof Error?error.message.slice(0,1000):'Webhook processing failed',
    }).eq('id',eventRecordId);
    throw error;
  }
});
