import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { queuePaymentReceipt } from '@/lib/email';

export async function completePayment(input:{
  paymentId:string;providerReference:string;amount:number;currency:string;
}) {
  const db=adminClient();
  const {data:payment,error}=await db.from('payments').select('*').eq('id',input.paymentId).maybeSingle();
  if(error) throw error;
  if(!payment) throw new Error('Payment record not found');
  const {data:result,error:settleError}=await db.rpc('apply_paid_payment',{
    p_payment:payment.id,
    p_provider_reference:input.providerReference,
    p_paid_amount:input.amount,
    p_currency:input.currency,
  });
  if(settleError) throw settleError;
  try {
    const [{data:plan},{data:profile}]=await Promise.all([
      db.from('billing_plans').select('name').eq('id',payment.plan_id).maybeSingle(),
      db.from('profiles').select('email,full_name').eq('id',payment.user_id).maybeSingle(),
    ]);
    const to=payment.customer_email??profile?.email;
    if(to) {
      await queuePaymentReceipt({
        idempotencyKey:'payment-receipt:'+payment.id,
        userId:payment.user_id,to,
        name:profile?.full_name,
        plan:plan?.name??payment.plan_id,
        amount:payment.amount,currency:payment.currency,
        credits:Number(payment.credits_to_grant),
        reference:input.providerReference,
      });
    }
  } catch(error) {
    console.error('[billing] receipt email enqueue failed',error);
  }
  return result as {status:string;duplicate:boolean;userId:string;planId:string;creditsGranted:number};
}
