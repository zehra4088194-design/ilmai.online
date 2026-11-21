import Link from 'next/link';
import { adminClient } from '@/lib/supabase/admin';
import { PageHead } from '@/components/admin/AdminShell';
import { fmtDate, fmtNum, fmtUsd, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
const KINDS = ['all', 'chat', 'compare', 'image', 'video', 'presentation', 'test', 'prompt_enhance', 'website'];

export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const sp = await searchParams;
  const kind = KINDS.includes(sp.kind ?? '') ? sp.kind! : 'all';
  let q = adminClient().from('usage_events').select('id,kind,model,prompt_tokens,completion_tokens,cost_usd,credits_used,latency_ms,status,error,created_at,profiles(email)').order('created_at', { ascending: false }).limit(150);
  if (kind !== 'all') q = q.eq('kind', kind);
  if (sp.status === 'error') q = q.eq('status', 'error');
  const { data } = await q;
  type Row = { id: number; kind: string; model: string | null; prompt_tokens: number; completion_tokens: number; cost_usd: number; credits_used: number; latency_ms: number | null; status: string; error: string | null; created_at: string; profiles: { email: string } | { email: string }[] | null };
  const rows = (data ?? []) as unknown as Row[];
  const email = (p: Row['profiles']) => (Array.isArray(p) ? p[0]?.email : p?.email) ?? '—';

  return (
    <>
      <PageHead title="Usage log" sub="The latest 150 requests across all features.">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => <Link key={k} href={`/admin/usage?kind=${k}`} className={cn('rounded-full px-3 py-1 text-sm font-semibold capitalize transition', k === kind && sp.status !== 'error' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent')}>{k}</Link>)}
          <Link href="/admin/usage?status=error" className={cn('rounded-full px-3 py-1 text-sm font-semibold transition', sp.status === 'error' ? 'bg-danger text-white' : 'bg-muted hover:bg-accent')}>Errors only</Link>
        </div>
      </PageHead>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5">When</th><th className="px-3">User</th><th className="px-3">Feature</th><th className="px-3">Model</th><th className="px-3">Tokens</th><th className="px-3">Cost</th><th className="px-3">Credits</th><th className="px-4">Latency</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'error' ? 'bg-danger/5' : ''}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                <td className="px-3">{email(r.profiles)}</td>
                <td className="px-3"><span className="badge">{r.kind}</span></td>
                <td className="max-w-[14rem] truncate px-3" title={r.error ?? r.model ?? ''}>{r.status === 'error' ? <span className="text-danger">{r.error ?? 'error'}</span> : r.model}</td>
                <td className="px-3">{fmtNum(r.prompt_tokens + r.completion_tokens)}</td>
                <td className="px-3">{fmtUsd(Number(r.cost_usd))}</td>
                <td className="px-3">{r.credits_used}</td>
                <td className="px-4">{r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)}s` : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No events</td></tr>}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
