'use client';
import { useState } from 'react';
import { Plus, Ban } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { fmtDate, fmtNum } from '@/lib/utils';

export type AdminUser = { id: string; email: string | null; full_name: string | null; role: 'user' | 'admin'; plan: 'free' | 'pro' | 'elite'; credits_balance: number; is_banned: boolean; created_at: string };

export function UsersAdmin({ initial }: { initial: AdminUser[] }) {
  const [users, setUsers] = useState(initial);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const toast = useToast();

  async function patch(id: string, p: Partial<AdminUser> & { creditsDelta?: number }) {
    const prev = users;
    const { creditsDelta, ...rest } = p;
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...rest, credits_balance: u.credits_balance + (creditsDelta ?? 0) } : u)));
    try { await api('/api/admin/users', 'PATCH', { id, ...p }); toast('Saved', 'ok'); }
    catch (e) { setUsers(prev); toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5">User</th><th className="px-3">Plan</th><th className="px-3">Role</th><th className="px-3">Credits</th><th className="px-3">Add credits</th><th className="px-4 text-center">Suspended</th></tr></thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className={u.is_banned ? 'bg-danger/5' : ''}>
                <td className="px-4 py-2.5"><p className="flex items-center gap-1.5 font-semibold">{u.full_name || '—'}{u.is_banned && <Ban className="h-3.5 w-3.5 text-danger" />}</p><p className="text-xs text-muted-foreground">{u.email} · joined {fmtDate(u.created_at)}</p></td>
                <td className="px-3"><select className="input !w-auto !py-1" value={u.plan} onChange={(e) => patch(u.id, { plan: e.target.value as AdminUser['plan'] })}><option>free</option><option>pro</option><option>elite</option></select></td>
                <td className="px-3"><select className="input !w-auto !py-1" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value as AdminUser['role'] })}><option>user</option><option>admin</option></select></td>
                <td className="px-3 font-bold">{fmtNum(u.credits_balance)}</td>
                <td className="px-3">
                  <div className="flex items-center gap-1.5">
                    {[100, 500, 2000].map((n) => <button key={n} className="btn-outline !px-2 !py-1 text-xs" onClick={() => patch(u.id, { creditsDelta: n })}>+{n}</button>)}
                    <input className="input !w-20 !py-1 text-xs" placeholder="±n" value={custom[u.id] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [u.id]: e.target.value }))} />
                    <button className="btn-primary !p-1.5" aria-label="Apply" onClick={() => { const n = parseInt(custom[u.id] ?? ''); if (n) { patch(u.id, { creditsDelta: n }); setCustom((c) => ({ ...c, [u.id]: '' })); } }}><Plus className="h-4 w-4" /></button>
                  </div>
                </td>
                <td className="px-4 text-center"><Switch checked={u.is_banned} onChange={(v) => patch(u.id, { is_banned: v })} label="Suspend" /></td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No users found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
