import { PageHead } from '@/components/admin/AdminShell';
import { BillingAdmin } from '@/components/admin/BillingAdmin';
import { requireAdminPage } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { getSettings } from '@/lib/settings';

export const dynamic='force-dynamic';

export default async function Page(){
  await requireAdminPage();
  const db=adminClient();
  const settings=await getSettings();
  const [{data:plans},{data:discounts},{data:payments}]=await Promise.all([
    db.from('billing_plans').select('*').order('sort_order'),
    db.from('billing_discounts').select('*').order('created_at',{ascending:false}).limit(200),
    db.from('payments').select('id,user_id,customer_email,provider,plan_id,amount,currency,status,created_at,paid_at').order('created_at',{ascending:false}).limit(100),
  ]);
  return <>
    <PageHead title="Plans & discounts" sub="Configure paid tiers, credit grants, Paddle product IDs, PayPro availability and discount codes."/>
    <BillingAdmin initial={{plans:plans??[],discounts:discounts??[],payments:payments??[],exchangeRate:settings.usd_pkr_rate,exchangeRateApiConfigured:!!process.env.EXCHANGE_RATE_API_KEY,providers:{paddleConfigured:!!process.env.PADDLE_API_KEY&&!!process.env.PADDLE_WEBHOOK_SECRET&&!!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN&&['sandbox','production'].includes(process.env.PADDLE_ENVIRONMENT??'')&&process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT===process.env.PADDLE_ENVIRONMENT,payproConfigured:!!process.env.PAYPRO_MERCHANT_NO&&!!process.env.PAYPRO_APP_SECRET&&!!process.env.PAYPRO_API_BASE_URL}}}/>
  </>;
}
