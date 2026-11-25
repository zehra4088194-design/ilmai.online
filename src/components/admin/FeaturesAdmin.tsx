'use client';
import { useState } from 'react';
import { ChevronDown, Save } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { iconFor } from '@/components/icons';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { cn } from '@/lib/utils';

export type Flag = {
  key: string; label: string; description: string; icon: string; enabled: boolean; visible: boolean;
  coming_soon: boolean; min_plan: 'free' | 'pro' | 'elite'; config: Record<string, unknown>;
};

function status(f: Flag) {
  if (f.enabled && f.visible && !f.coming_soon) return { t: `Live for ${f.min_plan}+ users`, c: 'bg-success/15 text-success' };
  if (f.visible && (f.coming_soon || !f.enabled)) return { t: 'Shown as “Coming soon”', c: 'bg-warning/15 text-warning' };
  if (f.enabled && !f.visible) return { t: 'Hidden from users (admins can test)', c: 'bg-muted text-muted-foreground' };
  return { t: 'Off', c: 'bg-muted text-muted-foreground' };
}

export function FeaturesAdmin({ initial }: { initial: Flag[] }) {
  const [flags, setFlags] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const toast = useToast();

  async function patch(key: string, p: Partial<Flag>) {
    const prev = flags;
    setFlags((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));
    try { await api('/api/admin/features', 'PATCH', { key, patch: p }); toast('Saved', 'ok'); }
    catch (e) { setFlags(prev); toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  }

  async function saveCfg(f: Flag) {
    try {
      const parsed = JSON.parse(cfg[f.key] ?? JSON.stringify(f.config));
      await patch(f.key, { config: parsed });
    } catch { toast('Config is not valid JSON', 'err'); }
  }

  return (
    <div className="space-y-3">
      {flags.map((f) => {
        const Icon = iconFor(f.icon);
        const st = status(f);
        const supportsPdfExport = f.key === 'presentations' || f.key === 'teacher_tests';
        return (
          <div key={f.key} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 p-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5" /></div>
              <div className="min-w-[12rem] flex-1">
                <p className="font-bold">{f.label} <code className="ml-1 text-xs font-normal text-muted-foreground">{f.key}</code></p>
                <p className="text-sm text-muted-foreground">{f.description}</p>
                <span className={cn('mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', st.c)}>{st.t}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={f.enabled} onChange={(v) => patch(f.key, { enabled: v })} label="Enabled" />Enabled</label>
                <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={f.visible} onChange={(v) => patch(f.key, { visible: v })} label="Visible" />Visible</label>
                <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={f.coming_soon} onChange={(v) => patch(f.key, { coming_soon: v })} label="Coming soon" />Coming soon</label>
                <select className="input !w-auto !py-1.5" value={f.min_plan} onChange={(e) => patch(f.key, { min_plan: e.target.value as Flag['min_plan'] })}>
                  <option value="free">Free+</option><option value="pro">Pro+</option><option value="elite">Elite</option>
                </select>
                <button className="btn-ghost h-9 w-9 !p-0" onClick={() => setOpen(open === f.key ? null : f.key)} aria-label="Advanced"><ChevronDown className={cn('h-4 w-4 transition', open === f.key && 'rotate-180')} /></button>
              </div>
            </div>
            {open === f.key && (
              <div className="space-y-3 border-t border-border bg-muted/40 p-4">
                {supportsPdfExport && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                    <div><p className="text-sm font-semibold">PDF export</p><p className="text-xs text-muted-foreground">Enable PDF downloads after the private renderer is healthy and configured in the main app.</p></div>
                    <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={f.config?.pdf_export === true} onChange={(v) => patch(f.key, { config: { ...f.config, pdf_export: v } })} label="PDF export" />{f.config?.pdf_export === true ? 'Enabled' : 'Disabled'}</label>
                  </div>
                )}
                <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Advanced JSON config (e.g. <code>{'{"default_model": "google/gemini-2.5-flash-image"}'}</code> for image generation)</p>
                <textarea className="input min-h-24 font-mono text-xs" value={cfg[f.key] ?? JSON.stringify(f.config, null, 2)} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value }))} />
                <button className="btn-primary !py-1.5" onClick={() => saveCfg(f)}><Save className="h-4 w-4" />Save config</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
