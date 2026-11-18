'use client';
import { useMemo, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { fmtNum } from '@/lib/utils';

export type AdminModel = {
  id: string; name: string; provider: string; context: number; pricePromptPerM: number; priceCompletionPerM: number;
  isFree: boolean; tier: 'free' | 'pro' | 'elite'; enabled: boolean; isDefault: boolean;
};

export function ModelsAdmin({ initial }: { initial: AdminModel[] }) {
  const [models, setModels] = useState(initial);
  const [q, setQ] = useState('');
  const [prov, setProv] = useState('all');
  const [flt, setFlt] = useState<'all' | 'on' | 'off' | 'free'>('all');
  const [limit, setLimit] = useState(60);
  const toast = useToast();

  const providers = useMemo(() => ['all', ...Array.from(new Set(models.map((m) => m.provider))).sort()], [models]);
  const shown = useMemo(() => models.filter((m) =>
    (prov === 'all' || m.provider === prov) &&
    (flt === 'all' || (flt === 'on' ? m.enabled : flt === 'off' ? !m.enabled : m.isFree)) &&
    (!q || m.name.toLowerCase().includes(q.toLowerCase()) || m.id.toLowerCase().includes(q.toLowerCase()))), [models, q, prov, flt]);

  async function patch(ids: string[], p: Partial<{ enabled: boolean; tier: string; is_default: boolean }>) {
    const prev = models;
    setModels((ms) => ms.map((m) => ids.includes(m.id) ? { ...m, ...(p.enabled !== undefined && { enabled: p.enabled }), ...(p.tier && { tier: p.tier as AdminModel['tier'] }) } : p.is_default ? { ...m, isDefault: false } : m)
      .map((m) => (p.is_default && ids.includes(m.id) ? { ...m, isDefault: true } : m)));
    try { await api('/api/admin/models', 'PATCH', { ids, patch: p }); toast(ids.length > 1 ? `Updated ${ids.length} models` : 'Saved', 'ok'); }
    catch (e) { setModels(prev); toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  }

  const enabledCount = models.filter((m) => m.enabled).length;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-3.5">
        <div className="relative min-w-[12rem] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className="input !pl-9" placeholder="Search models…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} /></div>
        <select className="input !w-auto" value={prov} onChange={(e) => { setProv(e.target.value); setLimit(60); }}>{providers.map((p) => <option key={p}>{p}</option>)}</select>
        <select className="input !w-auto" value={flt} onChange={(e) => setFlt(e.target.value as typeof flt)}><option value="all">All</option><option value="on">Enabled</option><option value="off">Disabled</option><option value="free">Free only</option></select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{enabledCount}/{models.length} enabled · {shown.length} shown</span>
        <button className="btn-outline !py-1.5" onClick={() => patch(shown.slice(0, 500).map((m) => m.id), { enabled: true })}>Enable shown</button>
        <button className="btn-outline !py-1.5" onClick={() => patch(shown.slice(0, 500).map((m) => m.id), { enabled: false })}>Disable shown</button>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5">Model</th><th className="px-3">Context</th><th className="px-3">$/M in · out</th><th className="px-3">Tier</th><th className="px-3 text-center">Default</th><th className="px-4 text-center">On</th></tr></thead>
            <tbody className="divide-y divide-border">
              {shown.slice(0, limit).map((m) => (
                <tr key={m.id} className={m.enabled ? '' : 'opacity-60'}>
                  <td className="px-4 py-2.5"><p className="font-semibold">{m.name}</p><p className="text-xs text-muted-foreground">{m.id}</p></td>
                  <td className="px-3">{fmtNum(m.context)}</td>
                  <td className="px-3 whitespace-nowrap">{m.isFree ? <span className="badge">Free</span> : `${m.pricePromptPerM.toFixed(2)} · ${m.priceCompletionPerM.toFixed(2)}`}</td>
                  <td className="px-3"><select className="input !w-auto !py-1" value={m.tier} onChange={(e) => patch([m.id], { tier: e.target.value })}><option value="free">free</option><option value="pro">pro</option><option value="elite">elite</option></select></td>
                  <td className="px-3 text-center"><button aria-label="Set default" onClick={() => patch([m.id], { is_default: true, enabled: true })}><Star className={`mx-auto h-4.5 w-4.5 ${m.isDefault ? 'fill-primary text-primary' : 'text-muted-foreground/40 hover:text-primary'}`} /></button></td>
                  <td className="px-4 text-center"><Switch checked={m.enabled} onChange={(v) => patch([m.id], { enabled: v })} label={`Enable ${m.name}`} /></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No models match</td></tr>}
            </tbody>
          </table>
        </div>
        {shown.length > limit && <button className="btn-ghost w-full !rounded-none border-t border-border py-3" onClick={() => setLimit((l) => l + 100)}>Show more ({shown.length - limit} left)</button>}
      </div>
    </div>
  );
}
