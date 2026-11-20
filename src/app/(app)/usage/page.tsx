import { MobileTopBar } from '@/components/chat/AppShell';
import { requireUserPage } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { fmtUsd,fmtNum,fmtDate } from '@/lib/utils';

export const dynamic='force-dynamic';

export default async function Page(){
  const {profile}=await requireUserPage();
  const since=new Date(Date.now()-30*24*60*60*1000).toISOString();
  const {data,error}=await adminClient().from('usage_events')
    .select('id,kind,model,prompt_tokens,completion_tokens,cost_usd,credits_used,latency_ms,status,error,created_at')
    .eq('user_id',profile.id).gte('created_at',since).order('created_at',{ascending:false}).limit(100);
  if(error) throw error;
  const rows=data??[];
  const totals=rows.reduce((sum,item)=>({
    credits:sum.credits+Number(item.credits_used??0),
    cost:sum.cost+Number(item.cost_usd??0),
    tokens:sum.tokens+Number(item.prompt_tokens??0)+Number(item.completion_tokens??0),
  }),{credits:0,cost:0,tokens:0});
  return <>
    <MobileTopBar title="Usage"/>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div><h1 className="text-2xl font-extrabold">Your usage</h1><p className="text-sm text-muted-foreground">Activity and provider usage over the last 30 days.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-muted-foreground">Credits used</p><p className="text-2xl font-bold">{fmtNum(totals.credits)}</p></div>
        <div className="card p-4"><p className="text-xs text-muted-foreground">Tokens processed</p><p className="text-2xl font-bold">{fmtNum(totals.tokens)}</p></div>
        <div className="card p-4"><p className="text-xs text-muted-foreground">Provider cost estimate</p><p className="text-2xl font-bold">{fmtUsd(totals.cost)}</p></div>
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Date</th><th className="px-3">Feature</th><th className="px-3">Model</th><th className="px-3">Tokens</th><th className="px-3">Credits</th><th className="px-4">Status</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map((row)=>(
          <tr key={row.id} className={row.status==='error'?'bg-danger/5':''}>
            <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(row.created_at)}</td>
            <td className="px-3"><span className="badge">{row.kind}</span></td>
            <td className="max-w-60 truncate px-3" title={row.error??row.model??''}>{row.model??(row.status==='error'?row.error:'—')}</td>
            <td className="px-3">{fmtNum(Number(row.prompt_tokens??0)+Number(row.completion_tokens??0))}</td>
            <td className="px-3">{fmtNum(Number(row.credits_used??0))}</td>
            <td className="px-4"><span className={row.status==='error'?'text-danger':'text-success'}>{row.status}</span></td>
          </tr>
        ))}{rows.length===0&&<tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No usage in the last 30 days.</td></tr>}</tbody>
      </table></div></div>
    </div></div>
  </>;
}
