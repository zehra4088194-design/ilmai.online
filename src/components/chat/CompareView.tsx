'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Trash2, Columns } from 'lucide-react';
import { Markdown } from '@/components/chat/Markdown';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { Composer } from '@/components/chat/Composer';
import { MobileTopBar, useApp } from '@/components/chat/AppShell';
import { useModels } from '@/components/chat/useModels';
import { useToast } from '@/components/providers';
import { LogoMark } from '@/components/ui/Logo';

type Turn = { role: 'user' | 'assistant'; content: string; error?: boolean };
type Col = { id: number; model: string; turns: Turn[]; busy: boolean };

let nextId = 1;

/** Ask one prompt to up to 3 models in parallel. Nothing is saved to history (ephemeral). */
export function CompareView() {
  const { features, refreshMe } = useApp();
  const toast = useToast();
  const { models, modelId } = useModels();
  const [cols, setCols] = useState<Col[]>([]);
  const [input, setInput] = useState('');
  const aborts = useRef<Record<number, AbortController>>({});

  // seed two columns once models are loaded
  useEffect(() => {
    if (models.length === 0 || !modelId) return;
    const usable = models.filter((m) => !m.locked);
    const second = usable.find((m) => m.id !== modelId) ?? usable[0];
    setCols((cs) => cs.length ? cs : [
      { id: nextId++, model: modelId, turns: [], busy: false },
      { id: nextId++, model: second?.id ?? modelId, turns: [], busy: false },
    ]);
  }, [models, modelId]);

  const upd = (id: number, f: (c: Col) => Col) => setCols((cs) => cs.map((c) => (c.id === id ? f(c) : c)));
  const anyBusy = cols.some((c) => c.busy);

  async function run(col: Col, text: string) {
    const history = col.turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
    upd(col.id, (c) => ({ ...c, busy: true, turns: [...c.turns, { role: 'user', content: text }, { role: 'assistant', content: '' }] }));
    const ac = new AbortController();
    aborts.current[col.id] = ac;
    const setLast = (content: string, error = false) =>
      upd(col.id, (c) => ({ ...c, turns: c.turns.map((t, i) => (i === c.turns.length - 1 ? { ...t, content, error } : t)) }));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ model: col.model, message: text, ephemeral: true, history }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setLast(acc);
      }
    } catch (e) {
      if (!ac.signal.aborted) setLast(e instanceof Error ? e.message : 'Failed', true);
    } finally {
      upd(col.id, (c) => ({ ...c, busy: false }));
    }
  }

  async function send() {
    const t = input.trim();
    if (!t || anyBusy || cols.length === 0) return;
    setInput('');
    await Promise.all(cols.map((c) => run(c, t)));
    refreshMe();
  }

  const addCol = () => {
    const usable = models.filter((m) => !m.locked);
    setCols((cs) => [...cs, { id: nextId++, model: usable[cs.length % usable.length]?.id ?? modelId, turns: [], busy: false }]);
  };

  return (
    <>
      <MobileTopBar title="Compare models">
        <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setCols((cs) => cs.map((c) => ({ ...c, turns: [] })))}><Trash2 className="h-3.5 w-3.5" /> Clear</button>
        {cols.length < 3 && <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={addCol}><Plus className="h-3.5 w-3.5" /> Add model</button>}
      </MobileTopBar>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
        <div className="grid h-full min-w-full gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(18rem, 1fr))` }}>
          <AnimatePresence>
            {cols.map((c) => (
              <motion.section key={c.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="card flex min-h-0 flex-col overflow-hidden">
                <header className="flex items-center gap-2 border-b border-border p-2.5">
                  <div className="min-w-0 flex-1"><ModelPicker compact models={models} value={c.model} disabled={c.busy} onChange={(id) => upd(c.id, (x) => ({ ...x, model: id }))} /></div>
                  {cols.length > 1 && <button className="btn-ghost h-8 w-8 !p-0" aria-label="Remove" onClick={() => { aborts.current[c.id]?.abort(); setCols((cs) => cs.filter((x) => x.id !== c.id)); }}><X className="h-4 w-4" /></button>}
                </header>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5">
                  {c.turns.length === 0 && (
                    <div className="grid h-full place-items-center text-center text-sm text-muted-foreground"><div><Columns className="mx-auto mb-2 h-7 w-7 text-primary/60" />Ask something below – every model answers at once.</div></div>
                  )}
                  {c.turns.map((t, i) => t.role === 'user' ? (
                    <div key={i} dir="auto" className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{t.content}</div>
                  ) : (
                    <div key={i} className="flex gap-2.5"><LogoMark className="mt-0.5 h-6 w-6 shrink-0" />
                      {t.error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{t.content}</p>
                        : t.content ? <Markdown>{t.content}</Markdown>
                        : <span className="mt-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />}
                    </div>
                  ))}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 sm:px-4 sm:pb-4">
        <Composer value={input} onChange={setInput} onSend={send} onStop={() => Object.values(aborts.current).forEach((a) => a.abort())} busy={anyBusy} features={features.filter((f) => f.key === 'x')}
          onUnavailable={() => toast('Coming soon')} placeholder="Ask all models at once…" />
      </div>
    </>
  );
}
