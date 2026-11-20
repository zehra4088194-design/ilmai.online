import { handle, json } from '@/lib/http';
import { adminClient } from '@/lib/supabase/admin';
import { requireUserApi } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireUserApi();
  const {data,error}=await adminClient().from('billing_plans')
    .select('id,name,description,currency,price_amount,credits_per_period,period_days,active,display_features,sort_order,paddle_price_id,paypro_enabled')
    .eq('active',true).order('sort_order');
  if(error) throw error;
  return json({
    plans:(data??[]).map((plan)=>({
      ...plan,
      paddleAvailable:!!plan.paddle_price_id && plan.currency==='USD' && !!process.env.PADDLE_API_KEY,
      payproAvailable:!!plan.paypro_enabled && plan.currency==='PKR' && !!process.env.PAYPRO_MERCHANT_NO && !!process.env.PAYPRO_APP_SECRET && !!process.env.PAYPRO_API_BASE_URL,
    })),
  },{headers:{'Cache-Control':'private, no-store'}});
});
