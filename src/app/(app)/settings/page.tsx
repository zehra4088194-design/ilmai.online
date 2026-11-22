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
  const [{data:usage},{data:balances,error:balanceError}] = await Promise.all([
    db.from('usage_events').select('kind,model,credits_used,created_at,status')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(12),
    db.rpc('get_credit_balances',{p_user:profile.id}),
  ]);
  if(balanceError) throw balanceError;
  const walletAvailable=Math.max(0,Number(balances?.walletBalance??0)-Number(balances?.walletReserved??0));
  const planAvailable=Math.max(0,Number(balances?.planBalance??0)-Number(balances?.planReserved??0));

  return (
    <>
      <MobileTopBar title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4"><p className="text-xs text-muted-foreground">Plan</p><p className="text-2xl font-extrabold capitalize">{profile.plan}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">Available shared plan credits</p><p className="text-2xl font-extrabold">{fmtNum(planAvailable)}</p>{balances?.periodEnd&&<p className="mt-1 text-xs text-muted-foreground">Expires {fmtDate(String(balances.periodEnd))}</p>}</div>
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
