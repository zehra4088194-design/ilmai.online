import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const {profile}=await requireUserApi();
  const {data,error}=await adminClient().from('payments')
    .select('id,provider,plan_id,amount,currency,status,created_at,paid_at,payment_method,provider_reference')
    .eq('user_id',profile.id).order('created_at',{ascending:false}).limit(30);
  if(error) throw error;
  return json({payments:data??[]},{headers:{'Cache-Control':'private, no-store'}});
});
