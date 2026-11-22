import 'server-only';
import { adminClient } from '@/lib/supabase/admin';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,(c)=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[c]!));

function renderEmail(template: string, payload: Record<string, unknown>) {
  if (template === 'payment_receipt') {
    const name=escapeHtml(payload.name || 'there');
    const plan=escapeHtml(payload.plan || 'Ilm AI');
    const amount=escapeHtml(payload.amount || '');
    const currency=escapeHtml(payload.currency || '');
    const credits=escapeHtml(payload.credits || '0');
    const reference=escapeHtml(payload.reference || '');
    return {
      subject:'Your Ilm AI payment is confirmed',
      html:'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17251e"><h1 style="color:#168454">Payment confirmed</h1><p>Hello '+name+',</p><p>Your <strong>'+plan+'</strong> purchase has been confirmed.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #ddd">Amount</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">'+amount+' '+currency+'</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd">Shared plan credits</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">'+credits+'</td></tr></table><p>Reference: '+reference+'</p><p>You can review your plan and activity in Ilm AI settings.</p></div>',
    };
  }
  return {subject:'Ilm AI notification',html:'<p>'+escapeHtml(payload.message || 'You have a new notification.')+'</p>'};
}

export async function queuePaymentReceipt(input: {
  idempotencyKey: string; userId: string; to: string; name?: string|null;
  plan: string; amount: string|number; currency: string; credits: number; reference: string;
}) {
  const db=adminClient();
  const {data:row,error}=await db.from('email_outbox').upsert({
    user_id:input.userId,idempotency_key:input.idempotencyKey,to_email:input.to,
    template:'payment_receipt',subject:'Your Ilm AI payment is confirmed',
    payload:{
      name:input.name || 'there',plan:input.plan,amount:input.amount,currency:input.currency,
      credits:input.credits,reference:input.reference,
    },status:'pending',
  },{onConflict:'idempotency_key',ignoreDuplicates:true}).select('id').maybeSingle();
  if(error) throw error;
  const id=row?.id;
  if(!id) {
    const existing=await db.from('email_outbox').select('id').eq('idempotency_key',input.idempotencyKey).maybeSingle();
    if(existing.error) throw existing.error;
    if(!existing.data) return false;
    return deliverEmailOutbox(existing.data.id);
  }
  return deliverEmailOutbox(id);
}

export async function deliverEmailOutbox(id: string) {
  const db=adminClient();
  const {data:row,error}=await db.from('email_outbox').select('*').eq('id',id).maybeSingle();
  if(error) throw error;
  if(!row || row.status==='sent') return !!row;
  const claimed=await db.from('email_outbox').update({
    status:'sending',attempts:Number(row.attempts ?? 0)+1,last_error:null,
  }).eq('id',id).in('status',['pending','failed']).select('id').maybeSingle();
  if(claimed.error) throw claimed.error;
  if(!claimed.data) return false;

  const key=process.env.RESEND_API_KEY;
  const from=process.env.EMAIL_FROM;
  if(!key || !from) {
    await db.from('email_outbox').update({status:'failed',last_error:'Resend is not configured (RESEND_API_KEY / EMAIL_FROM).'}).eq('id',id);
    return false;
  }

  const rendered=renderEmail(row.template,row.payload ?? {});
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      Authorization:'Bearer '+key,
      'Content-Type':'application/json',
      'Idempotency-Key':row.idempotency_key,
    },
    body:JSON.stringify({from,to:[row.to_email],subject:row.subject || rendered.subject,html:rendered.html}),
    signal:AbortSignal.timeout(20_000),
    cache:'no-store',
  }).catch(()=>null);
  if(!response?.ok) {
    const detail=response?await response.text().catch(()=>''):'Resend request failed';
    await db.from('email_outbox').update({status:'failed',last_error:detail.slice(0,1000)}).eq('id',id);
    return false;
  }
  const result=await response.json().catch(()=>({})) as {id?:string};
  const {error:updateError}=await db.from('email_outbox').update({
    status:'sent',provider_message_id:result.id ?? null,sent_at:new Date().toISOString(),last_error:null,
  }).eq('id',id);
  if(updateError) throw updateError;
  return true;
}
