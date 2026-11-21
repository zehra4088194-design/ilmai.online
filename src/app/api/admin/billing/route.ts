import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

const PlanPatch=z.object({
  id:z.enum(['free','pro','elite']),
  name:z.string().trim().min(1).max(80).optional(),
  description:z.string().trim().max(500).optional(),
  currency:z.enum(['PKR','USD']).optional(),
  price_amount:z.number().min(0).max(10_000_000).optional(),
  credits_per_period:z.number().int().min(0).max(10_000_000_000).optional(),
  period_days:z.number().int().min(1).max(366).optional(),
  paddle_price_id:z.string().trim().max(160).nullable().optional(),
  paddle_product_id:z.string().trim().max(160).nullable().optional(),
  paypro_enabled:z.boolean().optional(),
  active:z.boolean().optional(),
  display_features:z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  sort_order:z.number().int().min(0).max(1000).optional(),
}).strict().refine((value)=>Object.keys(value).length>1,'No plan fields supplied');

const DiscountCreate=z.object({
  code:z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  description:z.string().trim().max(300).default(''),
  discount_type:z.enum(['percent','fixed']),
  value:z.number().positive().max(1_000_000),
  currency:z.enum(['PKR','USD']).nullable().default(null),
  paddle_discount_id:z.string().trim().max(160).nullable().optional(),
  active:z.boolean().default(true),
  max_redemptions:z.number().int().positive().max(1_000_000).nullable().default(null),
  per_user_limit:z.number().int().min(1).max(20).default(1),
  starts_at:z.string().datetime().nullable().default(null),
  ends_at:z.string().datetime().nullable().default(null),
}).strict().superRefine((value,ctx)=>{
  if(value.discount_type==='percent'&&value.value>100) ctx.addIssue({code:'custom',message:'Percentage discounts cannot exceed 100%',path:['value']});
  if(value.discount_type==='fixed'&&!value.currency) ctx.addIssue({code:'custom',message:'Fixed discounts need a currency',path:['currency']});
  if(value.starts_at&&value.ends_at&&new Date(value.starts_at)>=new Date(value.ends_at)) ctx.addIssue({code:'custom',message:'End time must be after start time',path:['ends_at']});
});

export const GET=handle(async()=>{
  await requireAdminApi();
  const db=adminClient();
  const [{data:plans,error:planError},{data:discounts,error:discountError},{data:payments,error:paymentError}] = await Promise.all([
    db.from('billing_plans').select('*').order('sort_order'),
    db.from('billing_discounts').select('*').order('created_at',{ascending:false}).limit(200),
    db.from('payments').select('id,user_id,provider,plan_id,amount,currency,status,created_at,paid_at').order('created_at',{ascending:false}).limit(100),
  ]);
  if(planError) throw planError;if(discountError) throw discountError;if(paymentError) throw paymentError;
  return json({
    plans:plans??[],discounts:discounts??[],payments:payments??[],
    providers:{
      paddleConfigured:!!process.env.PADDLE_API_KEY&&!!process.env.PADDLE_WEBHOOK_SECRET&&!!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN&&['sandbox','production'].includes(process.env.PADDLE_ENVIRONMENT??'')&&process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT===process.env.PADDLE_ENVIRONMENT,
      payproConfigured:!!process.env.PAYPRO_MERCHANT_NO&&!!process.env.PAYPRO_APP_SECRET&&!!process.env.PAYPRO_API_BASE_URL,
    },
  },{headers:{'Cache-Control':'private, no-store'}});
});

export const PATCH=handle(async(req:NextRequest)=>{
  await requireAdminApi();
  const body=PlanPatch.parse(await req.json());
  const {id,...patch}=body;
  const db=adminClient();
  const {data:current,error:currentError}=await db.from('billing_plans').select('*').eq('id',id).single();
  if(currentError) throw currentError;
  const next={...current,...patch};
  if(next.active&&id!=='free') {
    if(Number(next.price_amount)<=0||Number(next.credits_per_period)<=0)
      throw new HttpError(400,'Set a positive price and credit amount before activating a paid plan');
    const paddleReady=next.currency==='USD'&&!!next.paddle_price_id&&!!process.env.PADDLE_API_KEY&&
      !!process.env.PADDLE_WEBHOOK_SECRET&&['sandbox','production'].includes(process.env.PADDLE_ENVIRONMENT??'');
    const payproReady=next.currency==='PKR'&&!!next.paypro_enabled&&!!process.env.PAYPRO_MERCHANT_NO&&
      !!process.env.PAYPRO_APP_SECRET&&!!process.env.PAYPRO_API_BASE_URL;
    if(!paddleReady&&!payproReady)
      throw new HttpError(400,'Configure a matching payment provider before activating this paid plan');
  }
  const {data,error}=await db.from('billing_plans')
    .update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
  if(error) throw error;
  return json({plan:data});
});

export const POST=handle(async(req:NextRequest)=>{
  await requireAdminApi();
  const body=DiscountCreate.parse(await req.json());
  if(body.discount_type==='fixed'&&body.currency===null) throw new HttpError(400,'Choose a currency for fixed discounts');
  const {data,error}=await adminClient().from('billing_discounts')
    .insert({...body,code:body.code.toUpperCase()}).select('*').single();
  if(error) {
    if(error.code==='23505') throw new HttpError(409,'A discount with this code already exists');
    throw error;
  }
  return json({discount:data},{status:201});
});

export const DELETE=handle(async(req:NextRequest)=>{
  await requireAdminApi();
  const {id}=z.object({id:z.string().uuid()}).parse(await req.json());
  const {error}=await adminClient().from('billing_discounts').delete().eq('id',id);
  if(error) throw error;
  return json({ok:true});
});
