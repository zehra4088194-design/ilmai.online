import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
const CancelBody=z.object({
  subscriptionId:z.string().uuid(),
  effectiveFrom:z.enum(['next_billing_period','immediately']).default('next_billing_period'),
}).strict();

export const GET=handle(async()=>{
  const {profile}=await requireUserApi();
  const {data,error}=await adminClient().from('subscriptions').select('*')
    .eq('user_id',profile.id).order('created_at',{ascending:false}).limit(20);
  if(error) throw error;
  return json({subscriptions:data??[]},{headers:{'Cache-Control':'private, no-store'}});
});

export const POST=handle(async(req:NextRequest)=>{
  const {profile}=await requireUserApi();
  const body=CancelBody.parse(await req.json());
  const db=adminClient();
  const {data:subscription,error}=await db.from('subscriptions').select('*')
    .eq('id',body.subscriptionId).eq('user_id',profile.id).eq('provider','paddle').maybeSingle();
  if(error) throw error;
  if(!subscription) throw new HttpError(404,'Paddle subscription not found');
  if(!subscription.external_subscription_id) throw new HttpError(400,'This payment has no Paddle recurring subscription');
  if(subscription.status==='cancelled'||subscription.status==='expired')
    return json({status:subscription.status,alreadyCancelled:true});
  if(subscription.cancel_at_period_end&&body.effectiveFrom==='next_billing_period')
    return json({status:subscription.status,cancelAtPeriodEnd:true});

  const apiKey=process.env.PADDLE_API_KEY;
  if(!apiKey) throw new HttpError(503,'Paddle is not configured');
  const base=process.env.PADDLE_ENVIRONMENT==='sandbox'?'https://sandbox-api.paddle.com':'https://api.paddle.com';
  const response=await fetch(base+'/subscriptions/'+encodeURIComponent(subscription.external_subscription_id)+'/cancel',{
    method:'POST',
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'cancel-'+subscription.id+'-'+body.effectiveFrom},
    body:JSON.stringify({effective_from:body.effectiveFrom}),
    signal:AbortSignal.timeout(20_000),cache:'no-store',
  }).catch(()=>null);
  if(!response?.ok) {
    const detail=response?await response.text().catch(()=>''):'Paddle request failed';
    throw new HttpError(502,detail.slice(0,300)||'Could not cancel the Paddle subscription','paddle_cancel_failed');
  }
  const payload=await response.json().catch(()=>({})) as {data?:{status?:string;scheduled_change?:{action?:string;effective_at?:string}|null}};
  const cancelAtEnd=body.effectiveFrom==='next_billing_period';
  const nextStatus=payload.data?.status==='canceled'?'cancelled':subscription.status;
  const nextEnd=payload.data?.scheduled_change?.effective_at??subscription.current_period_end;
  const {error:updateError}=await db.from('subscriptions').update({
    status:nextStatus,cancel_at_period_end:cancelAtEnd,current_period_end:nextEnd,
    updated_at:new Date().toISOString(),
  }).eq('id',subscription.id).eq('user_id',profile.id);
  if(updateError) throw updateError;
  if(nextStatus==='cancelled') {
    const {count,error:countError}=await db.from('subscriptions').select('id',{count:'exact',head:true})
      .eq('user_id',profile.id).eq('status','active').gt('current_period_end',new Date().toISOString());
    if(countError) throw countError;
    if((count??0)===0) {
      const {error:downgradeError}=await db.from('profiles').update({plan:'free'}).eq('id',profile.id);
      if(downgradeError) throw downgradeError;
    }
  }
  return json({status:nextStatus,cancelAtPeriodEnd:cancelAtEnd,currentPeriodEnd:nextEnd});
});
