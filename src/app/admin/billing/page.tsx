import { PageHead } from '@/components/admin/AdminShell';
import { BillingAdmin } from '@/components/admin/BillingAdmin';
import { requireAdminPage } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export default async function Page(){
  await requireAdminPage();
  const db=adminClient();
  const [{data:plans},{data:discounts},{data:payments}]=await Promise.all([
    db.from('billing_plans').select('*').order('sort_order'),
    db.from('billing_discounts').select('*').order('created_at',{ascending:false}).limit(200),
    db.from('payments').select('id,provider,plan_id,amount,currency,status,created_at').order('created_at',{ascending:false}).limit(100),
  ]);
  return <>
    <PageHead title="Plans & discounts" sub="Configure paid tiers, credit grants, Paddle product IDs, PayPro availability and discount codes."/>
    <BillingAdmin initial={{plans:plans??[],discounts:discounts??[],payments:payments??[]}}/>
  </>;
}
