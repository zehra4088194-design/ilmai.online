import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError } from '@/lib/http';
import { adminClient } from '@/lib/supabase/admin';
import { verifyPayProSignature, timestampIsFresh } from '@/lib/billing';
import { completePayment } from '@/lib/billing-settlement';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const Payload=z.object({
  tradeNo:z.string().min(1).max(100),
  platFormTradeNo:z.string().min(1).max(150),
  amount:z.string().regex(/^\d+(\.\d{1,2})?$/),
  status:z.string().min(1).max(20),
  message:z.string().max(500).optional(),
  successTime:z.string().max(100).optional(),
  timestamp:z.union([z.string(),z.number()]),
  sign:z.string().regex(/^[a-fA-F0-9]{32}$/),
  paymentType:z.string().optional(),
}).passthrough();

export const POST=handle(async(req:NextRequest)=>{
  const secret=process.env.PAYPRO_APP_SECRET;
  if(!secret) throw new HttpError(503,'PayPro webhook secret is not configured','paypro_webhook_unconfigured');
  const body=Payload.parse(await req.json());
  if(!timestampIsFresh(body.timestamp,5*60_000))
    throw new HttpError(401,'PayPro notification timestamp is expired','paypro_timestamp_expired');
  const fields={...body} as Record<string,unknown>;
  delete fields.sign;
  if(!verifyPayProSignature(fields,secret,body.sign))
    throw new HttpError(401,'Invalid PayPro notification signature','invalid_paypro_signature');
  const db=adminClient();
  const eventId=body.tradeNo+':'+body.platFormTradeNo+':'+body.status;
  const insert=await db.from('webhook_events').insert({
    provider:'paypro',event_id:eventId,event_type:'payin.notification',status:'received',
  }).select('id').maybeSingle();
  let eventRow=insert.data?.id as string|undefined;
  if(insert.error) {
    if(insert.error.code!=='23505') throw insert.error;
    const existing=await db.from('webhook_events').select('id,status')
      .eq('provider','paypro').eq('event_id',eventId).maybeSingle();
    if(existing.error) throw existing.error;
    if(!existing.data) throw insert.error;
    if(existing.data.status==='processed'||existing.data.status==='ignored')
      return new Response('OK',{status:200,headers:{'Content-Type':'text/plain'}});
    eventRow=existing.data.id;
    const reset=await db.from('webhook_events').update({status:'received',error:null}).eq('id',eventRow);
    if(reset.error) throw reset.error;
  }

  try{
    const {data:payment,error}=await db.from('payments').select('*')
      .eq('provider','paypro').eq('trade_no',body.tradeNo).maybeSingle();
    if(error) throw error;
    if(!payment) throw new Error('PayPro trade number does not match a local payment');
    if(payment.provider_reference&&payment.provider_reference!==body.platFormTradeNo)
      throw new Error('PayPro platform trade number does not match the recorded payment');
    if(Math.round(Number(body.amount)*100)!==Math.round(Number(payment.amount)*100))
      throw new Error('PayPro paid amount does not match the order amount');

    if(body.status==='0000') {
      await completePayment({
        paymentId:payment.id,providerReference:body.platFormTradeNo,
        amount:Number(body.amount),currency:'PKR',
      });
    } else if(body.status==='0015') {
      const update=await db.from('payments').update({
        provider_reference:body.platFormTradeNo,
        updated_at:new Date().toISOString(),
      }).eq('id',payment.id).eq('status','pending');
      if(update.error) throw update.error;
    } else {
      const update=await db.from('payments').update({
        status:'failed',provider_reference:body.platFormTradeNo,
        metadata:{...(payment.metadata??{}),paypro_message:body.message??'Payment declined'},
        updated_at:new Date().toISOString(),
      }).eq('id',payment.id).eq('status','pending');
      if(update.error) throw update.error;
    }
    const mark=await db.from('webhook_events').update({
      status:body.status==='0015'?'ignored':'processed',
      processed_at:new Date().toISOString(),
    }).eq('id',eventRow);
    if(mark.error) throw mark.error;
    return new Response('OK',{status:200,headers:{'Content-Type':'text/plain'}});
  }catch(error){
    await db.from('webhook_events').update({
      status:'failed',error:error instanceof Error?error.message.slice(0,1000):'Notification processing failed',
    }).eq('id',eventRow);
    throw error;
  }
});
