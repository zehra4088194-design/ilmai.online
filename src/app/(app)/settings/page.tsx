import { requireUserPage } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { MobileTopBar } from '@/components/chat/AppShell';
import { SettingsClient } from '@/components/SettingsClient';
import { fmtDate, fmtNum } from '@/lib/utils';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { profile } = await requireUserPage();
  const db=adminClient();
  const [{data:usage},{data:wallet},{data:bucket}] = await Promise.all([
    db.from('usage_events').select('kind,model,credits_used,created_at,status')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(12),
    db.from('profiles').select('credits_balance,credits_reserved').eq('id',profile.id).single(),
    db.from('plan_credit_buckets').select('plan_id,credits_remaining,credits_reserved,period_end')
      .eq('user_id',profile.id).eq('status','active').gt('period_end',new Date().toISOString())
      .order('period_start',{ascending:false}).limit(1).maybeSingle(),
  ]);
  const walletAvailable=Math.max(0,Number(wallet?.credits_balance??0)-Number(wallet?.credits_reserved??0));
  const planAvailable=bucket?Math.max(0,Number(bucket.credits_remaining)-Number(bucket.credits_reserved)):0;

  return (
    <>
      <MobileTopBar title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4"><p className="text-xs text-muted-foreground">Plan</p><p className="text-2xl font-extrabold capitalize">{profile.plan}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">Available shared plan credits</p><p className="text-2xl font-extrabold">{fmtNum(planAvailable)}</p>{bucket&&<p className="mt-1 text-xs text-muted-foreground">Expires {fmtDate(bucket.period_end)}</p>}</div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">Available wallet credits</p><p className="text-2xl font-extrabold">{fmtNum(walletAvailable)}</p><p className="mt-1 text-xs text-muted-foreground">Purchased/top-up credits remain separate from monthly plan credits.</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">Member since</p><p className="text-lg font-bold">{new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</p></div>
          </div>
          <SettingsClient id={profile.id} name={profile.full_name ?? ''} preferences={profile.preferences ?? {}} />
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Recent activity</h2>
            {(usage ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
              <ul className="divide-y divide-border text-sm">
                {(usage ?? []).map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate"><span className="badge mr-2">{u.kind}</span>{u.model ?? '—'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">−{u.credits_used} · {fmtDate(u.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
