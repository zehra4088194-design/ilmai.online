'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Pencil } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

export type Skill = { id: string; slug: string; name: string; description: string; subject: string | null; instructions: string; schema_json: Record<string, unknown>; template_html: string; is_active: boolean };
const EMPTY = { slug: '', name: '', description: '', subject: '', instructions: '', schema: '{}', html: '' };

export function SkillsAdmin({ initial }: { initial: Skill[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string) => setF((x) => ({ ...x, [k]: v }));

  function edit(s: Skill) {
    setEditId(s.id); setOpen(true);
    setF({ slug: s.slug, name: s.name, description: s.description, subject: s.subject ?? '', instructions: s.instructions, schema: JSON.stringify(s.schema_json, null, 2), html: s.template_html });
  }

  async function save() {
    let schema: Record<string, unknown>;
    try { schema = JSON.parse(f.schema || '{}'); } catch { toast('Output schema is not valid JSON', 'err'); return; }
    const body = { slug: f.slug, name: f.name, description: f.description, subject: f.subject || null, instructions: f.instructions, schema_json: schema, template_html: f.html };
    try {
      if (editId) await api('/api/admin/skills', 'PATCH', { id: editId, patch: body }); else await api('/api/admin/skills', 'POST', body);
      toast('Saved', 'ok'); setOpen(false); setEditId(null); setF(EMPTY); router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditId(null); setF(EMPTY); setOpen(!open); }}><Plus className="h-4 w-4" />New skill</button></div>

      {open && (
        <div className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="input" placeholder="slug (e.g. mcq-sheet)" value={f.slug} onChange={(e) => set('slug', e.target.value)} />
            <input className="input" placeholder="Name shown to teachers" value={f.name} onChange={(e) => set('name', e.target.value)} />
            <input className="input" placeholder="Subject (optional)" value={f.subject} onChange={(e) => set('subject', e.target.value)} />
          </div>
          <input className="input" placeholder="Short description" value={f.description} onChange={(e) => set('description', e.target.value)} />
          <label className="block text-xs font-semibold text-muted-foreground">Hidden instructions for the AI (skill.md)<textarea className="input mt-1 min-h-28 font-mono text-xs" value={f.instructions} onChange={(e) => set('instructions', e.target.value)} /></label>
          <label className="block text-xs font-semibold text-muted-foreground">Output JSON schema<textarea className="input mt-1 min-h-24 font-mono text-xs" value={f.schema} onChange={(e) => set('schema', e.target.value)} /></label>
          <label className="block text-xs font-semibold text-muted-foreground">PDF template (HTML + CSS)<textarea className="input mt-1 min-h-40 font-mono text-xs" value={f.html} onChange={(e) => set('html', e.target.value)} /></label>
          <div className="flex gap-2"><button className="btn-primary" onClick={save}><Save className="h-4 w-4" />Save skill</button><button className="btn-ghost" onClick={() => { setOpen(false); setEditId(null); }}>Cancel</button></div>
        </div>
      )}

      {initial.length === 0 && !open && <div className="card p-10 text-center text-muted-foreground">No skills yet. A skill = hidden AI instructions + output schema + PDF template. Teachers only see its name.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {initial.map((s) => (
          <div key={s.id} className="card flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1"><p className="font-bold">{s.name} <code className="text-xs font-normal text-muted-foreground">{s.slug}</code></p><p className="text-sm text-muted-foreground">{s.description || '—'}</p>{s.subject && <span className="badge mt-2">{s.subject}</span>}</div>
            <Switch checked={s.is_active} label="Active" onChange={async (v) => { try { await api('/api/admin/skills', 'PATCH', { id: s.id, patch: { is_active: v } }); router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } }} />
            <button className="btn-ghost h-9 w-9 !p-0" onClick={() => edit(s)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
            <button className="btn-ghost h-9 w-9 !p-0 text-danger" aria-label="Delete" onClick={async () => { if (!confirm('Delete this skill?')) return; await api('/api/admin/skills', 'DELETE', { id: s.id }); router.refresh(); }}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
