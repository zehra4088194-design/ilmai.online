import Link from 'next/link';
import { Users, UserPlus, Zap, MessageSquare, Hash, DollarSign, Coins, AlertTriangle, Timer, HardDrive, Database, CircleHelp, Target, Trophy, Lightbulb } from 'lucide-react';
import { adminClient } from '@/lib/supabase/admin';
import { PageHead } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/admin/StatCard';
import { AreaChart, BarChart, BarList } from '@/components/admin/Charts';
import { fmtNum, fmtUsd, cn } from '@/lib/utils';

type Overview = {
  users_total: number; users_new: number; users_active_today: number; users_active_period: number;
  conversations_total: number; messages_total: number; requests_period: number; errors_period: number;
  tokens_period: number; cost_period: number; credits_period: number; avg_latency_ms: number;
  media_total: number; media_bytes: number; plans: Record<string, number>;
  by_day: { day: string; requests: number; tokens: number; cost: number; users: number }[];
  signups_by_day: { day: string; signups: number }[];
  by_model: { model: string; requests: number; tokens: number; cost: number }[];
  by_kind: { kind: string; requests: number; cost: number }[];
  top_users: { id: string; email: string; full_name: string | null; requests: number; tokens: number; cost: number }[];
};

/** Continuous day axis so charts don't skip empty days. */
function fill(days: number, rows: { day: string }[], key: string) {
  const map = new Map(rows.map((r) => [r.day, Number((r as unknown as Record<string, number>)[key]) || 0]));
  const out: { label: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    out.push({ label: d, value: map.get(d) ?? 0 });
  }
  return out;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Math.min(90, Math.max(7, parseInt((await searchParams).days ?? '30') || 30));
  const { data, error } = await adminClient().rpc('admin_overview', { p_days: days });

  if (error || !data) {
    return (
      <>
        <PageHead title="Overview" />
        <div className="card flex gap-3 p-6"><Database className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div><p className="font-bold">Database not ready</p><p className="mt-1 text-sm text-muted-foreground">Run <code className="rounded bg-muted px-1.5">supabase/migrations/0001_init.sql</code> in the Supabase SQL editor and check the env variables. ({error?.message ?? 'no data'})</p></div></div>
      </>
    );
  }
  const o = data as Overview;

  // learning analytics (quizzes + suggestions)
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const db = adminClient();
  const [qz, at, sg] = await Promise.all([
    db.from('quizzes').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('quiz_attempts').select('score,total').gte('created_at', since).limit(2000),
    db.from('usage_events').select('id', { count: 'exact', head: true }).eq('kind', 'suggest').gte('created_at', since),
  ]);
  const attempts = (at.data ?? []) as { score: number; total: number }[];
  const avgScore = attempts.length ? Math.round((attempts.reduce((n, a) => n + (a.total ? a.score / a.total : 0), 0) / attempts.length) * 100) : 0;
  const mb = (o.media_bytes / 1048576).toFixed(1);

  return (
    <>
      <PageHead title="Overview" sub={`Last ${days} days`}>
        <div className="glass flex rounded-xl p-1">
          {[7, 30, 90].map((d) => <Link key={d} href={`/admin?days=${d}`} className={cn('rounded-lg px-3.5 py-1.5 text-sm font-semibold transition', d === days ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{d}d</Link>)}
        </div>
      </PageHead>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard i={0} Icon={Users} label="Total users" value={fmtNum(o.users_total)} hint={`${Object.entries(o.plans).map(([k, v]) => `${v} ${k}`).join(' · ') || '—'}`} />
        <StatCard i={1} Icon={UserPlus} label="New users" value={fmtNum(o.users_new)} hint={`in ${days} days`} />
        <StatCard i={2} Icon={Zap} label="Active today" value={fmtNum(o.users_active_today)} hint={`${fmtNum(o.users_active_period)} active in period`} />
        <StatCard i={3} Icon={MessageSquare} label="Requests" value={fmtNum(o.requests_period)} hint={`${fmtNum(o.conversations_total)} chats · ${fmtNum(o.messages_total)} msgs total`} />
        <StatCard i={4} Icon={Hash} label="Tokens" value={fmtNum(o.tokens_period)} />
        <StatCard i={5} Icon={DollarSign} label="Provider cost" value={fmtUsd(o.cost_period)} hint="what OpenRouter charged" />
        <StatCard i={6} Icon={Coins} label="Credits used" value={fmtNum(o.credits_period)} />
        <StatCard i={7} Icon={AlertTriangle} label="Errors" value={fmtNum(o.errors_period)} hint={o.requests_period ? `${((o.errors_period / o.requests_period) * 100).toFixed(1)}% of requests` : undefined} />
        <StatCard i={8} Icon={Timer} label="Avg latency" value={`${((o.avg_latency_ms ?? 0) / 1000).toFixed(1)}s`} />
        <StatCard i={9} Icon={HardDrive} label="Media stored" value={fmtNum(o.media_total)} hint={`${mb} MB in B2`} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-muted-foreground">Learning</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard i={0} Icon={CircleHelp} label="Quizzes created" value={fmtNum(qz.count ?? 0)} />
        <StatCard i={1} Icon={Target} label="Quiz attempts" value={fmtNum(attempts.length)} />
        <StatCard i={2} Icon={Trophy} label="Average score" value={`${avgScore}%`} />
        <StatCard i={3} Icon={Lightbulb} label="Suggestions served" value={fmtNum(sg.count ?? 0)} hint="free models" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5"><h2 className="mb-3 font-bold">Requests per day</h2><AreaChart data={fill(days, o.by_day, 'requests')} /></section>
        <section className="card p-5"><h2 className="mb-3 font-bold">Cost per day (USD)</h2><BarChart data={fill(days, o.by_day, 'cost')} format={(n) => fmtUsd(n)} /></section>
        <section className="card p-5"><h2 className="mb-3 font-bold">New sign-ups</h2><BarChart data={fill(days, o.signups_by_day, 'signups')} /></section>
        <section className="card p-5"><h2 className="mb-3 font-bold">Daily active users</h2><AreaChart data={fill(days, o.by_day, 'users')} /></section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2"><h2 className="mb-4 font-bold">Top models</h2><BarList rows={o.by_model.map((m) => ({ label: m.model, value: m.requests, sub: fmtUsd(m.cost) }))} format={fmtNum} /></section>
        <section className="card p-5"><h2 className="mb-4 font-bold">By feature</h2><BarList rows={o.by_kind.map((k) => ({ label: k.kind, value: k.requests, sub: fmtUsd(k.cost) }))} format={fmtNum} /></section>
      </div>

      <section className="card mt-4 overflow-hidden">
        <h2 className="p-5 pb-3 font-bold">Top users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-2">User</th><th className="px-3 py-2">Requests</th><th className="px-3 py-2">Tokens</th><th className="px-5 py-2">Cost</th></tr></thead>
            <tbody className="divide-y divide-border">
              {o.top_users.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No activity yet</td></tr>}
              {o.top_users.map((u) => <tr key={u.id}><td className="px-5 py-2.5"><p className="font-semibold">{u.full_name || '—'}</p><p className="text-xs text-muted-foreground">{u.email}</p></td><td className="px-3">{fmtNum(u.requests)}</td><td className="px-3">{fmtNum(u.tokens)}</td><td className="px-5">{fmtUsd(u.cost)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
