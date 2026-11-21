'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, Search, Lock, Eye, Check, Layers } from 'lucide-react';
import type { PickerModel } from '@/components/chat/ModelPicker';
import { cn, fmtNum } from '@/lib/utils';

const short = (m?: PickerModel) => (m?.name ?? '').replace(/^[^:]+:\s*/, '').replace(/\s*\(free\)/i, '');

/** AI-Fiesta-style strip: selected models as pills (✕ to remove) + a searchable multi-select to add more. */
export function ModelBar({ models, selected, onToggle, max, disabled }: {
  models: PickerModel[]; selected: string[]; onToggle: (id: string) => void; max: number; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<'all' | 'free' | 'vision'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return models
      .filter((m) => (chip === 'free' ? m.isFree : chip === 'vision' ? m.vision : true))
      .filter((m) => !s || m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s))
      .slice(0, 80);
  }, [models, q, chip]);

  return (
    <div ref={ref} className="relative flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none]">
      <AnimatePresence initial={false}>
        {selected.map((id) => (
          <motion.span key={id} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-accent py-1 pl-3 pr-1.5 text-xs font-semibold text-accent-foreground">
            <span className="max-w-[9rem] truncate">{short(byId.get(id)) || id}</span>
            {selected.length > 1 && !disabled && (
              <button onClick={() => onToggle(id)} aria-label="Remove model" className="grid h-4.5 w-4.5 place-items-center rounded-full hover:bg-primary/20"><X className="h-3 w-3" /></button>
            )}
          </motion.span>
        ))}
      </AnimatePresence>

      <button disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50">
        {max > 1 ? <><Plus className="h-3.5 w-3.5" />Models <span className="opacity-60">{selected.length}/{max}</span></> : <><Layers className="h-3.5 w-3.5" />Change model</>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className="glass fixed bottom-28 left-3 right-3 z-50 rounded-2xl bg-card p-2 shadow-2xl sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 sm:w-[26rem]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input autoFocus className="input !py-2 !pl-9" placeholder="Search models…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="my-2 flex items-center gap-1.5 px-0.5">
              {(['all', 'free', 'vision'] as const).map((c) => (
                <button key={c} onClick={() => setChip(c)} className={cn('rounded-full px-3 py-1 text-xs font-semibold capitalize transition', chip === c ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent')}>{c}</button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">{max > 1 ? `Pick up to ${max}` : 'Pick one'}</span>
            </div>
            <div className="max-h-[min(22rem,55vh)] space-y-0.5 overflow-y-auto">
              {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No models match</p>}
              {list.map((m) => {
                const on = selected.includes(m.id);
                return (
                  <button key={m.id} disabled={m.locked} onClick={() => { onToggle(m.id); if (max <= 1) setOpen(false); }}
                    className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition', on ? 'bg-accent' : 'hover:bg-muted', m.locked && 'cursor-not-allowed opacity-50')}>
                    <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.provider} · {fmtNum(m.context)} ctx{m.isFree ? '' : ` · $${m.pricePromptPerM.toFixed(2)}/M in`}</p>
                    </div>
                    {m.vision && <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                    {m.isFree ? <span className="badge">Free</span> : m.tier !== 'free' && <span className="badge uppercase">{m.tier}</span>}
                    {m.locked && <Lock className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
