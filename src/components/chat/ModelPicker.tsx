'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Search, Lock, Eye, Check } from 'lucide-react';
import { cn, fmtNum } from '@/lib/utils';
import { ProviderLogo } from '@/components/chat/ProviderLogo';

export type PickerModel = {
  id: string; name: string; provider: string; context: number; isFree: boolean; tier: 'free' | 'pro' | 'elite';
  pricePromptPerM: number; priceCompletionPerM: number; vision: boolean; locked: boolean;
};

export function ModelPicker({ models, value, onChange, compact = false, disabled }: {
  models: PickerModel[]; value: string; onChange: (id: string) => void; compact?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<'all' | 'free' | 'vision'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === value);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return models
      .slice()
      .sort((a, b) => Number(b.id === 'auto') - Number(a.id === 'auto') || a.name.localeCompare(b.name))
      .filter((m) => (chip === 'free' ? m.isFree : chip === 'vision' ? m.vision : true))
      .filter((m) => !s || m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s))
      .slice(0, 80);
  }, [models, q, chip]);

  return (
    <div ref={ref} className="relative">
      <button disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={cn('btn-outline max-w-full !justify-between gap-2 !rounded-xl', compact ? '!px-3 !py-1.5 text-xs' : '!px-3.5')}>
        <span className="flex min-w-0 items-center gap-2 truncate font-semibold">{current && <ProviderLogo provider={current.provider} className="!h-5 !w-5 !min-w-5 !max-w-5" />}<span className="truncate">{current?.name ?? 'Choose model'}</span></span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className="glass absolute left-0 top-full z-30 mt-2 w-[min(92vw,24rem)] rounded-2xl bg-card p-2 shadow-glow">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input autoFocus className="input !py-2 !pl-9" placeholder="Search models…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="my-2 flex gap-1.5 px-0.5">
              {(['all', 'free', 'vision'] as const).map((c) => (
                <button key={c} onClick={() => setChip(c)} className={cn('rounded-full px-3 py-1 text-xs font-semibold capitalize transition', chip === c ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent')}>{c}</button>
              ))}
              <span className="ml-auto self-center text-xs text-muted-foreground">{models.length} models</span>
            </div>
            <div className="max-h-80 space-y-0.5 overflow-y-auto">
              {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No models match</p>}
              {list.map((m) => (
                <button key={m.id} disabled={m.locked} onClick={() => { onChange(m.id); setOpen(false); }}
                  className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition', m.id === value ? 'bg-accent' : 'hover:bg-muted', m.locked && 'cursor-not-allowed opacity-50')}>
                                    <ProviderLogo provider={m.provider} className="!h-7 !w-7 !min-w-7 !max-w-7" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.id === 'auto' ? 'Ilm AI · Automatically picks a suitable model' : m.provider + ' · ' + fmtNum(m.context) + ' ctx' + (m.isFree ? '' : ` · ${m.pricePromptPerM.toFixed(2)}/M in`)}</p>
                  </div>
                  {m.vision && <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                  {m.isFree ? <span className="badge">Free</span> : m.tier !== 'free' && <span className="badge uppercase">{m.tier}</span>}
                  {m.locked ? <Lock className="h-3.5 w-3.5" /> : m.id === value && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
