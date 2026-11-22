import { MobileTopBar } from '@/components/chat/AppShell';
import { requireUserPage } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { fmtUsd,fmtNum,fmtDate } from '@/lib/utils';

export const dynamic='force-dynamic';

export default async function Page(){
  const {profile}=await requireUserPage();
  const since=new Date(Date.now()-30*24*60*60*1000).toISOString();
  const db=adminClient();
  const [{data,error},{data:balances,error:balanceError}]=await Promise.all([
    db.from('usage_events')
      .select('id,kind,model,provider,prompt_tokens,completion_tokens,cost_usd,cost_pkr,usd_to_pkr,credits_used,plan_credits_used,wallet_credits_used,credit_multiplier,model_tier,provider_usage,usage_details,latency_ms,status,error,created_at')
      .eq('user_id',profile.id).gte('created_at',since).order('created_at',{ascending:false}).limit(100),
    db.rpc('get_credit_balances',{p_user:profile.id}),
  ]);
  if(error) throw error;
  if(balanceError) throw balanceError;
  const rows=data??[];
  const planAvailable=Math.max(0,Number(balances?.planBalance??0)-Number(balances?.planReserved??0));
  const walletAvailable=Math.max(0,Number(balances?.walletBalance??0)-Number(balances?.walletReserved??0));
  const totals=rows.reduce((sum,item)=>({
    credits:sum.credits+Number(item.credits_used??0),
    cost:sum.cost+Number(item.cost_usd??0),
    costPkr:sum.costPkr+Number(item.cost_pkr??0),
    tokens:sum.tokens+Number(item.prompt_tokens??0)+Number(item.completion_tokens??0),
  }),{credits:0,cost:0,costPkr:0,tokens:0});
  const hasPkrSnapshot=rows.some((row)=>row.cost_pkr!==null);
  return <>
    <MobileTopBar title="Usage"/>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div><h1 className="text-2xl font-extrabold">Your usage</h1><p className="text-sm text-muted-foreground">Activity and provider usage over the last 30 days.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><p className="text-xs text-muted-foreground">Credits used · 30 days</p><p className="text-2xl font-bold">{fmtNum(totals.credits)}</p></div>
        <div className="card p-4"><p className="text-xs text-muted-foreground">Tokens processed · 30 days</p><p className="text-2xl font-bold">{fmtNum(totals.tokens)}</p></div>
        <div className="card p-4"><p className="text-xs text-muted-foreground">Provider cost · 30 days</p><p className="text-2xl font-bold">{fmtUsd(totals.cost)}</p><p className="mt-1 text-xs text-muted-foreground">{hasPkrSnapshot?'≈ Rs. '+totals.costPkr.toFixed(2)+' at each request’s saved rate':'PKR rate not available for these records'}</p></div>
        <div className="card p-4"><p className="text-xs text-muted-foreground">Available credits</p><p className="text-2xl font-bold">{fmtNum(planAvailable+walletAvailable)}</p><p className="mt-1 text-xs text-muted-foreground">Monthly plan: {fmtNum(planAvailable)} · Wallet: {fmtNum(walletAvailable)}</p></div>
      </div>
      {balances?.periodEnd&&<p className="text-xs text-muted-foreground">Your {String(balances.planId??profile.plan).toUpperCase()} shared allowance refreshes on {fmtDate(String(balances.periodEnd))}. Plan credits are used before wallet credits and expire at the end of the billing period.</p>}
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Date</th><th className="px-3">Feature</th><th className="px-3">Model / provider</th><th className="px-3">Tokens</th><th className="px-3">Cost</th><th className="px-3">Multiplier</th><th className="px-3">Plan / wallet</th><th className="px-4">Credits</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map((row)=>(
          <tr key={row.id} className={row.status==='error'?'bg-danger/5':''}>
            <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(row.created_at)}</td>
            <td className="px-3"><span className="badge">{row.kind}</span></td>
            <td className="max-w-60 truncate px-3" title={row.error??row.model??''}><p>{row.model??(row.status==='error'?row.error:'—')}</p><p className="text-xs text-muted-foreground">{row.provider??'—'}</p></td>
            <td className="px-3">{fmtNum(Number(row.prompt_tokens??0)+Number(row.completion_tokens??0))}</td>
            <td className="px-3"><p>{fmtUsd(Number(row.cost_usd??0))}</p><p className="text-xs text-muted-foreground">{row.cost_pkr===null?'PKR —':'Rs. '+Number(row.cost_pkr).toFixed(2)}</p></td>
            <td className="px-3">{Number(row.credit_multiplier??1).toFixed(2)}×</td>
            <td className="whitespace-nowrap px-3 text-xs">{fmtNum(Number(row.plan_credits_used??0))} / {fmtNum(Number(row.wallet_credits_used??0))}</td>
            <td className="px-4"><p>{fmtNum(Number(row.credits_used??0))}</p><span className={row.status==='error'?'text-danger':'text-success'}>{row.status}</span></td>
          </tr>
        ))}{rows.length===0&&<tr><td colSpan={8} className="p-10 text-center text-muted-foreground">No usage in the last 30 days.</td></tr>}</tbody>
      </table></div></div>
    </div></div>
  </>;
}
