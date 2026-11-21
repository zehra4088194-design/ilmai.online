import 'server-only';
import { HttpError } from '@/lib/http';
import { adminClient } from '@/lib/supabase/admin';
import { discountedAmount } from '@/lib/billing';

export async function getPlanQuote(input:{
  userId:string; planId:string; discountCode?:string; provider:'paddle'|'paypro';
}) {
  const db=adminClient();
  const {data:plan,error}=await db.from('billing_plans').select('*').eq('id',input.planId).eq('active',true).maybeSingle();
  if(error) throw error;
  if(!plan || plan.id==='free') throw new HttpError(404,'This paid plan is not available','plan_unavailable');
  if(input.provider==='paddle' && (!plan.paddle_price_id || plan.currency!=='USD' ||
    !process.env.PADDLE_API_KEY || !process.env.PADDLE_WEBHOOK_SECRET || !process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ||
    !['sandbox','production'].includes(process.env.PADDLE_ENVIRONMENT??'') || process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT!==process.env.PADDLE_ENVIRONMENT))
    throw new HttpError(400,'Paddle is not fully configured for this plan','paddle_plan_unconfigured');
  if(input.provider==='paypro' && (!plan.paypro_enabled || plan.currency!=='PKR' ||
    !process.env.PAYPRO_MERCHANT_NO || !process.env.PAYPRO_APP_SECRET || !process.env.PAYPRO_API_BASE_URL))
    throw new HttpError(400,'PayPro/JazzCash/EasyPaisa is not fully configured for this plan','paypro_plan_unconfigured');

  let discount:null|Record<string,unknown>=null;
  if(input.discountCode?.trim()) {
    const code=input.discountCode.trim().toUpperCase();
    const {data,error:discountError}=await db.from('billing_discounts').select('*').eq('code',code).eq('active',true).maybeSingle();
    if(discountError) throw discountError;
    if(!data) throw new HttpError(400,'Discount code is invalid or inactive','invalid_discount');
    const now=Date.now();
    if(data.starts_at && new Date(data.starts_at).getTime()>now) throw new HttpError(400,'This discount is not active yet');
    if(data.ends_at && new Date(data.ends_at).getTime()<now) throw new HttpError(400,'This discount has expired');
    const [{count:total},{count:perUser}]=await Promise.all([
      db.from('discount_redemptions').select('id',{count:'exact',head:true}).eq('discount_id',data.id),
      db.from('discount_redemptions').select('id',{count:'exact',head:true}).eq('discount_id',data.id).eq('user_id',input.userId),
    ]);
    if(data.max_redemptions!==null && (total??0)>=data.max_redemptions) throw new HttpError(400,'This discount has reached its redemption limit');
    if((perUser??0)>=data.per_user_limit) throw new HttpError(400,'You have already used this discount the maximum number of times');
    if(input.provider==='paddle' && !data.paddle_discount_id)
      throw new HttpError(400,'This discount has no matching Paddle discount configured','paddle_discount_unconfigured');
    discount=data;
  }

  const price=Number(plan.price_amount);
  const amount=discountedAmount(price,plan.currency,discount as never);
  if(!Number.isFinite(amount) || amount<=0) throw new HttpError(400,'The final plan price must be greater than zero');
  if(input.provider==='paypro' && (!Number.isInteger(amount) || amount<100))
    throw new HttpError(400,'PayPro collection requires a whole-rupee amount of at least PKR 100');
  return {plan,discount,amount,credits:Number(plan.credits_per_period)};
}
