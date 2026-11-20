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

export const POST=handle(async(req:NextRequest)=>{
  const {profile,user}=await requireUserApi();
  const body=Body.parse(await req.json());
  if(!user.email) throw new HttpError(400,'Your account needs a verified email before checkout');
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
  const {data:payment,error:insertError}=await db.from('payments').insert({
    user_id:profile.id,provider:'paddle',plan_id:quote.plan.id,discount_id:quote.discount?.id??null,
    amount:quote.amount,currency:quote.plan.currency,credits_to_grant:quote.credits,
    status:'pending',customer_email:user.email,idempotency_key:body.requestId,
    metadata:{request_id:body.requestId},
  }).select('id').single();
  if(insertError) throw insertError;

  const apiKey=process.env.PADDLE_API_KEY;
  const environment=process.env.PADDLE_ENVIRONMENT==='sandbox'?'sandbox':'production';
  if(!apiKey) throw new HttpError(503,'Paddle is not configured on this deployment','paddle_not_configured');
  const base=environment==='sandbox'?'https://sandbox-api.paddle.com':'https://api.paddle.com';
  const payload:Record<string,unknown>={
    items:[{price_id:quote.plan.paddle_price_id,quantity:1}],
    customer:{email:user.email},
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
  const result=await response.json().catch(()=>({})) as {data?:{id?:string;checkout?:{url?:string};customer_id?:string}};
  const transaction=result.data;
  if(!transaction?.id || !transaction.checkout?.url) {
    await db.from('payments').update({status:'failed',updated_at:new Date().toISOString()}).eq('id',payment.id);
    throw new HttpError(502,'Paddle did not return a checkout URL','paddle_checkout_invalid');
  }
  const {error:updateError}=await db.from('payments').update({
    provider_reference:transaction.id,
    metadata:{request_id:body.requestId,checkout_url:transaction.checkout.url,customer_id:transaction.customer_id??null},
    updated_at:new Date().toISOString(),
  }).eq('id',payment.id);
  if(updateError) throw updateError;
  return json({paymentId:payment.id,checkoutUrl:transaction.checkout.url},{status:201,headers:{'Cache-Control':'private, no-store'}});
});
