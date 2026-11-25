import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { getPlanQuote } from '@/lib/billing-service';
import { formatPayProMobile, payProSignature } from '@/lib/billing';

export const dynamic='force-dynamic';
const Body=z.object({
  requestId:z.string().uuid(),planId:z.enum(['pro','elite']),
  acceptedPolicies:z.literal(true),
  paymentType:z.enum(['jazzcash','easypaisa']),
  name:z.string().trim().min(2).max(100),
  mobile:z.string().trim().min(10).max(16),
  email:z.string().trim().email().max(250),
  discountCode:z.string().trim().max(40).optional(),
}).strict();

export const POST=handle(async(req:NextRequest)=>{
  const {profile,user}=await requireUserApi();
  const body=Body.parse(await req.json());
  const policyAcceptance={termsVersion:'2026-11-25',refundPolicyVersion:'2026-11-25',acceptedAt:new Date().toISOString()};
  const db=adminClient();
  const existing=await db.from('payments').select('id,status,trade_no,provider_reference,metadata')
    .eq('user_id',profile.id).eq('provider','paypro').eq('idempotency_key',body.requestId).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data) {
    if(existing.data.status==='pending') return json({
      paymentId:existing.data.id,tradeNo:existing.data.trade_no,
      platformTradeNo:existing.data.provider_reference,status:'pending',duplicate:true,
      message:'Approve the payment request on your JazzCash/Easypaisa mobile account.',
    });
    if(existing.data.status==='paid') return json({paymentId:existing.data.id,status:'paid',duplicate:true});
    throw new HttpError(409,'This payment request has already been processed');
  }

  const quote=await getPlanQuote({userId:profile.id,planId:body.planId,discountCode:body.discountCode,provider:'paypro'});
  const merchant=process.env.PAYPRO_MERCHANT_NO;
  const secret=process.env.PAYPRO_APP_SECRET;
  const base=process.env.PAYPRO_API_BASE_URL?.replace(/\/+$/,'');
  const notifyUrl=process.env.PAYPRO_NOTIFY_URL ?? ((process.env.NEXT_PUBLIC_SITE_URL??'https://ilmai.online').replace(/\/+$/,'')+'/api/webhooks/paypro');
  if(!merchant||!secret||!base) throw new HttpError(503,'PayPro credentials/base URL are not configured','paypro_not_configured');
  if(!notifyUrl.startsWith('https://')) throw new HttpError(503,'PAYPRO_NOTIFY_URL must be an HTTPS URL');

  let mobile:string;
  try{mobile=formatPayProMobile(body.mobile);}catch(e){throw new HttpError(400,e instanceof Error?e.message:'Invalid mobile number');}
  const tradeNo='ILM'+Date.now().toString()+randomUUID().replace(/-/g,'').slice(0,12);
  const {data:payment,error:insertError}=await db.from('payments').insert({
    user_id:profile.id,provider:'paypro',trade_no:tradeNo,plan_id:quote.plan.id,discount_id:quote.discount?.id??null,
    amount:quote.amount,currency:'PKR',credits_to_grant:quote.credits,status:'pending',
    customer_email:user.email??body.email,payment_method:body.paymentType,idempotency_key:body.requestId,
    metadata:{customer_name:body.name,mobile,period_days:quote.plan.period_days,policy_acceptance:policyAcceptance},
  }).select('id').single();
  if(insertError) throw insertError;

  const payload:Record<string,string>={
    tradeNo,paymentType:body.paymentType,amount:String(Math.round(quote.amount)),
    name:body.name,mobile,email:user.email??body.email,remark:'Ilm AI '+quote.plan.name,
    timestamp:String(Date.now()),custId:randomUUID().replace(/-/g,''),notifyUrl,
  };
  payload.sign=payProSignature(payload,secret);
  const response=await fetch(base+'/v1/payproPK/payinApi',{
    method:'POST',
    headers:{'Content-Type':'application/json','merchantNo':merchant},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(25_000),
    cache:'no-store',
  }).catch(()=>null);
  if(!response?.ok) {
    const detail=response?await response.text().catch(()=>''):'PayPro request failed';
    await db.from('payments').update({status:'failed',metadata:{customer_name:body.name,error:detail.slice(0,500)},updated_at:new Date().toISOString()}).eq('id',payment.id);
    throw new HttpError(502,detail.slice(0,400)||'PayPro could not create the payment request','paypro_checkout_failed');
  }
  const result=await response.json().catch(()=>({})) as {
    code?:string;success?:boolean|string;msg?:string;
    data?:{platFormTradeNo?:string;status?:string;desc?:string};
  };
  if(result.code!=='0000'||!(result.success===true||result.success==='true')) {
    const detail=result.data?.desc??result.msg??'PayPro rejected the payment request';
    await db.from('payments').update({status:'failed',metadata:{customer_name:body.name,provider_message:detail},updated_at:new Date().toISOString()}).eq('id',payment.id);
    throw new HttpError(502,detail,'paypro_payment_rejected');
  }
  const providerStatus=String(result.data?.status??'');
  if(!['0000','0015'].includes(providerStatus)||!result.data?.platFormTradeNo) {
    const detail=result.data?.desc??'PayPro returned an invalid payment response';
    await db.from('payments').update({status:'failed',metadata:{customer_name:body.name,provider_message:detail},updated_at:new Date().toISOString()}).eq('id',payment.id);
    throw new HttpError(502,detail,'paypro_payment_rejected');
  }
  await db.from('payments').update({
    provider_reference:result.data.platFormTradeNo,
    metadata:{customer_name:body.name,mobile,period_days:quote.plan.period_days,paypro_initial_status:providerStatus,policy_acceptance:policyAcceptance},
    updated_at:new Date().toISOString(),
  }).eq('id',payment.id);
  return json({
    paymentId:payment.id,tradeNo,platformTradeNo:result.data.platFormTradeNo,
    status:'pending',message:'Approve the payment request on your JazzCash/Easypaisa mobile account, then check its status here.',
  },{status:202,headers:{'Cache-Control':'private, no-store'}});
});
