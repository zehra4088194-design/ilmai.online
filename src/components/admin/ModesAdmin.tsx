'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Save } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { iconFor, ICON_NAMES } from '@/components/icons';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { cn } from '@/lib/utils';

export type AdminMode = {
  id: string; slug: string; audience: 'student' | 'teacher' | 'both'; name: string; name_ur: string | null; icon: string;
  description: string; system_prompt: string; starters: string[]; tool: string | null; is_active: boolean; sort_order: number;
};
const EMPTY = { slug: '', audience: 'student', name: '', name_ur: '', icon: 'sparkles', description: '', system_prompt: '', starters: '', tool: '', sort_order: 100 };

export function ModesAdmin({ initial }: { initial: AdminMode[] }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  function edit(m: AdminMode) {
    setEditId(m.id); setOpen(true);
    setF({ slug: m.slug, audience: m.audience, name: m.name, name_ur: m.name_ur ?? '', icon: m.icon, description: m.description, system_prompt: m.system_prompt, starters: m.starters.join('\n'), tool: m.tool ?? '', sort_order: m.sort_order });
  }

  async function save() {
    const body = {
      slug: f.slug, audience: f.audience, name: f.name, name_ur: f.name_ur || null, icon: f.icon, description: f.description,
      system_prompt: f.system_prompt, starters: f.starters.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8), tool: f.tool || null, sort_order: Number(f.sort_order) || 100,
    };
    try {
      if (editId) await api('/api/admin/modes', 'PATCH', { id: editId, patch: body }); else await api('/api/admin/modes', 'POST', body);
      toast('Saved', 'ok'); setOpen(false); setEditId(null); setF(EMPTY); router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  }

  const group = (aud: string) => initial.filter((m) => m.audience === aud);
  const Section = ({ title, list }: { title: string; list: AdminMode[] }) => list.length === 0 ? null : (
    <div className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((m) => { const I = iconFor(m.icon); return (
          <div key={m.id} className={cn('card flex items-start gap-3 p-4', !m.is_active && 'opacity-60')}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><I className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="font-bold">{m.name} <code className="text-xs font-normal text-muted-foreground">{m.slug}</code>{m.tool && <span className="badge ml-2">{m.tool}</span>}</p><p className="text-sm text-muted-foreground">{m.description}</p><p className="mt-1 text-xs text-muted-foreground">{m.starters.length} starters · prompt {m.system_prompt.length} chars</p></div>
            <Switch checked={m.is_active} label="Active" onChange={async (v) => { try { await api('/api/admin/modes', 'PATCH', { id: m.id, patch: { is_active: v } }); router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } }} />
            <button className="btn-ghost h-9 w-9 !p-0" onClick={() => edit(m)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
            <button className="btn-ghost h-9 w-9 !p-0 text-danger" aria-label="Delete" onClick={async () => { if (!confirm(`Delete mode “${m.name}”?`)) return; await api('/api/admin/modes', 'DELETE', { id: m.id }); router.refresh(); }}><Trash2 className="h-4 w-4" /></button>
          </div>); })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditId(null); setF(EMPTY); setOpen(!open); }}><Plus className="h-4 w-4" />New mode</button></div>
      {open && (
        <div className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <input className="input" placeholder="slug (e.g. study-buddy)" value={f.slug} onChange={(e) => set('slug', e.target.value)} />
            <input className="input" placeholder="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
            <input dir="rtl" className="input font-urdu" placeholder="اردو نام" value={f.name_ur} onChange={(e) => set('name_ur', e.target.value)} />
            <select className="input" value={f.audience} onChange={(e) => set('audience', e.target.value)}><option value="student">Student</option><option value="teacher">Teacher</option><option value="both">Both</option></select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className="input" value={f.icon} onChange={(e) => set('icon', e.target.value)}>{ICON_NAMES.map((n) => <option key={n}>{n}</option>)}</select>
            <select className="input" value={f.tool} onChange={(e) => set('tool', e.target.value)}><option value="">No special tool</option><option value="quiz">Quiz builder on the start screen</option></select>
            <input type="number" className="input" placeholder="Sort order" value={f.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} />
          </div>
          <input className="input" placeholder="Short description (shown on the start screen)" value={f.description} onChange={(e) => set('description', e.target.value)} />
          <label className="block text-xs font-semibold text-muted-foreground">Hidden instructions for the AI (system prompt)<textarea className="input mt-1 min-h-36 text-sm" value={f.system_prompt} onChange={(e) => set('system_prompt', e.target.value)} /></label>
          <label className="block text-xs font-semibold text-muted-foreground">Starter prompts – one per line (max 8)<textarea className="input mt-1 min-h-28 text-sm" value={f.starters} onChange={(e) => set('starters', e.target.value)} /></label>
          <div className="flex gap-2"><button className="btn-primary" onClick={save}><Save className="h-4 w-4" />Save mode</button><button className="btn-ghost" onClick={() => { setOpen(false); setEditId(null); }}>Cancel</button></div>
        </div>
      )}
      <Section title="Student modes" list={group('student')} />
      <Section title="Teacher modes" list={group('teacher')} />
      <Section title="Both" list={group('both')} />
    </div>
  );
}
