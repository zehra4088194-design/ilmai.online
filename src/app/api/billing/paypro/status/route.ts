import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { payProSignature } from '@/lib/billing';
import { completePayment } from '@/lib/billing-settlement';

export const dynamic='force-dynamic';
const Body=z.object({paymentId:z.string().uuid()}).strict();

export const POST=handle(async(req:NextRequest)=>{
  const {profile}=await requireUserApi();
  const {paymentId}=Body.parse(await req.json());
  const db=adminClient();
  const {data:payment,error}=await db.from('payments').select('*')
    .eq('id',paymentId).eq('user_id',profile.id).eq('provider','paypro').maybeSingle();
  if(error) throw error;
  if(!payment) throw new HttpError(404,'Payment not found');
  if(payment.status==='paid') return json({status:'paid',paymentId});
  if(payment.status!=='pending') return json({status:payment.status,paymentId});

  const merchant=process.env.PAYPRO_MERCHANT_NO;
  const secret=process.env.PAYPRO_APP_SECRET;
  const base=process.env.PAYPRO_API_BASE_URL?.replace(/\/+$/,'');
  if(!merchant||!secret||!base) throw new HttpError(503,'PayPro is not configured');
  const payload={tradeNo:payment.trade_no,timestamp:String(Date.now())};
  const signed={...payload,sign:payProSignature(payload,secret)};
  const response=await fetch(base+'/v1/payproPK/queryPayInResult',{
    method:'POST',headers:{'Content-Type':'application/json','merchantNo':merchant},
    body:JSON.stringify(signed),signal:AbortSignal.timeout(20_000),cache:'no-store',
  }).catch(()=>null);
  if(!response?.ok) {
    const detail=response?await response.text().catch(()=>''):'PayPro query failed';
    throw new HttpError(503,detail.slice(0,300)||'Could not query PayPro payment status','paypro_query_failed');
  }
  const result=await response.json().catch(()=>({})) as {
    code?:string;success?:boolean|string;msg?:string;
    data?:{status?:string;tradeNo?:string;platFormTradeNo?:string;amount?:string;message?:string};
  };
  if(result.code!=='0000'||!(result.success===true||result.success==='true')) {
    throw new HttpError(502,result.msg??'PayPro could not verify payment status','paypro_query_invalid');
  }
  const data=result.data;
  if(!data?.status||data.tradeNo!==payment.trade_no) throw new HttpError(502,'PayPro returned an invalid payment status');
  if(data.status==='0000') {
    const amount=Number(data.amount);
    if(!Number.isFinite(amount)) throw new HttpError(502,'PayPro returned an invalid paid amount');
    const settlement=await completePayment({
      paymentId,providerReference:data.platFormTradeNo??payment.provider_reference??'',
      amount,currency:'PKR',
    });
    return json({status:'paid',paymentId,settlement});
  }
  if(data.status==='0015') return json({status:'pending',paymentId,message:data.message??'Awaiting mobile wallet approval'});
  const {error:updateError}=await db.from('payments').update({
    status:'failed',provider_reference:data.platFormTradeNo??payment.provider_reference,
    metadata:{...(payment.metadata??{}),paypro_message:data.message??'Payment declined'},
    updated_at:new Date().toISOString(),
  }).eq('id',paymentId).eq('user_id',profile.id).eq('status','pending');
  if(updateError) throw updateError;
  return json({status:'failed',paymentId,message:data.message??'Payment was not completed'});
});
