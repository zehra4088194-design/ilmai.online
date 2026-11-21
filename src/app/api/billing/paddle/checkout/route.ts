import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { getPlanQuote } from '@/lib/billing-service';

export const dynamic='force-dynamic';
const Body=z.object({
  requestId:z.string().uuid(),
  planId:z.enum(['pro','elite']),
  discountCode:z.string().trim().max(40).optional(),
}).strict();

type PaddlePrice = {
  unit_price?:{amount?:string;currency_code?:string};
  status?:string;
  billing_cycle?:{interval?:string;frequency?:number}|null;
};
type PaddleDiscount = {
  type?:string;amount?:string;currency_code?:string|null;
};

async function paddleJson<T>(url:string,apiKey:string):Promise<T> {
  const response=await fetch(url,{
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(20_000),cache:'no-store',
  }).catch(()=>null);
  if(!response?.ok) {
    const detail=response?await response.text().catch(()=>''):'Paddle request failed';
    throw new HttpError(502,detail.slice(0,300)||'Could not verify the Paddle catalogue item','paddle_catalog_unavailable');
  }
  return await response.json() as T;
}

export const POST=handle(async(req:NextRequest)=>{
  const {profile,user}=await requireUserApi();
  const body=Body.parse(await req.json());
  if(!user.email) throw new HttpError(400,'Your account needs a verified email before checkout');

  const environment=process.env.PADDLE_ENVIRONMENT;
  const apiKey=process.env.PADDLE_API_KEY;
  if(!apiKey||!process.env.PADDLE_WEBHOOK_SECRET||!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN||!['sandbox','production'].includes(environment??'')||process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT!==environment) {
    throw new HttpError(503,'Paddle API key, webhook secret and a valid environment are required','paddle_not_configured');
  }
  const base=environment==='sandbox'?'https://sandbox-api.paddle.com':'https://api.paddle.com';
  const db=adminClient();
  const existing=await db.from('payments').select('id,status,provider_reference,metadata')
    .eq('user_id',profile.id).eq('provider','paddle').eq('idempotency_key',body.requestId).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data) {
    const url=typeof existing.data.metadata?.checkout_url==='string'?existing.data.metadata.checkout_url:null;
    if(url && existing.data.status==='pending') return json({paymentId:existing.data.id,checkoutUrl:url,duplicate:true});
    if(existing.data.status==='paid') return json({paymentId:existing.data.id,status:'paid',duplicate:true});
    throw new HttpError(409,'This checkout request has already been created');
  }

  const quote=await getPlanQuote({userId:profile.id,planId:body.planId,discountCode:body.discountCode,provider:'paddle'});
  const priceResponse=await paddleJson<{data?:PaddlePrice}>(base+'/prices/'+encodeURIComponent(String(quote.plan.paddle_price_id)),apiKey);
  const cataloguePrice=priceResponse.data?.unit_price;
  const expectedMinor=Math.round(Number(quote.plan.price_amount)*100);
  if(!cataloguePrice || priceResponse.data?.status!=='active' || cataloguePrice.currency_code!==quote.plan.currency || Number(cataloguePrice.amount)!==expectedMinor) {
    throw new HttpError(409,'The Paddle price ID must be active and match the currency and base price saved in Admin → Plans & discounts','paddle_price_mismatch');
  }
  const cycle=priceResponse.data?.billing_cycle??null;
  if(cycle) {
    const frequency=Number(cycle.frequency??0);
    const cycleDays=cycle.interval==='day'?frequency:cycle.interval==='week'?frequency*7:cycle.interval==='month'?frequency*30:cycle.interval==='year'?frequency*365:0;
    if(!cycleDays||Math.abs(cycleDays-Number(quote.plan.period_days))>3) {
      throw new HttpError(409,'The Paddle recurring interval does not match the plan period configured in Admin → Plans & discounts','paddle_billing_cycle_mismatch');
    }
  }

  if(quote.discount?.paddle_discount_id) {
    const discountResponse=await paddleJson<{data?:PaddleDiscount}>(base+'/discounts/'+encodeURIComponent(String(quote.discount.paddle_discount_id)),apiKey);
    const paddleDiscount=discountResponse.data;
    const expectedType=quote.discount.discount_type==='percent'?'percentage':'flat';
    const expectedDiscount=quote.discount.discount_type==='percent'
      ?Number(quote.discount.value)
      :Math.round(Number(quote.discount.value)*100);
    if(!paddleDiscount || paddleDiscount.type!==expectedType || Number(paddleDiscount.amount)!==expectedDiscount ||
      (expectedType==='flat'&&paddleDiscount.currency_code!==quote.plan.currency)) {
      throw new HttpError(409,'The Paddle discount ID does not match this discount code. Update it in Admin → Plans & discounts.','paddle_discount_mismatch');
    }
  }

  const {data:payment,error:insertError}=await db.from('payments').insert({
    user_id:profile.id,provider:'paddle',plan_id:quote.plan.id,discount_id:quote.discount?.id??null,
    amount:quote.amount,currency:quote.plan.currency,credits_to_grant:quote.credits,
    status:'pending',customer_email:user.email,idempotency_key:body.requestId,
    metadata:{request_id:body.requestId},
  }).select('id').single();
  if(insertError) throw insertError;

  const payload:Record<string,unknown>={
    items:[{price_id:quote.plan.paddle_price_id,quantity:1}],
    collection_mode:'automatic',
    checkout:{url:null},
    custom_data:{payment_id:payment.id,user_id:profile.id,plan_id:quote.plan.id},
  };
  if(quote.discount?.paddle_discount_id) payload.discount_id=quote.discount.paddle_discount_id;
  const response=await fetch(base+'/transactions',{
    method:'POST',
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':payment.id},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(25_000),
    cache:'no-store',
  }).catch(()=>null);
  if(!response?.ok) {
    const detail=response?await response.text().catch(()=>''):'Paddle request failed';
    await db.from('payments').update({status:'failed',metadata:{request_id:body.requestId,error:detail.slice(0,500)},updated_at:new Date().toISOString()}).eq('id',payment.id);
    throw new HttpError(502,detail.slice(0,400)||'Paddle checkout could not be created','paddle_checkout_failed');
  }
  const result=await response.json().catch(()=>({})) as {data?:{id?:string;checkout?:{url?:string|null};customer_id?:string}};
  const transaction=result.data;
  if(!transaction?.id || !transaction.checkout?.url) {
    await db.from('payments').update({status:'failed',metadata:{request_id:body.requestId,paddle_transaction_id:transaction?.id??null},updated_at:new Date().toISOString()}).eq('id',payment.id);
    throw new HttpError(502,'Paddle did not return a checkout URL. Confirm that a default payment link is configured for your approved checkout domain in Paddle.','paddle_checkout_invalid');
  }
  const {error:updateError}=await db.from('payments').update({
    provider_reference:transaction.id,
    metadata:{request_id:body.requestId,checkout_url:transaction.checkout.url,customer_id:transaction.customer_id??null},
    updated_at:new Date().toISOString(),
  }).eq('id',payment.id);
  if(updateError) throw updateError;
  return json({paymentId:payment.id,checkoutUrl:transaction.checkout.url},{status:201,headers:{'Cache-Control':'private, no-store'}});
});
