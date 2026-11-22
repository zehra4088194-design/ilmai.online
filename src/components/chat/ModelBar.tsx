'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, Search, Lock, Eye, Check, MessageSquare, GitCompareArrows, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PickerModel } from '@/components/chat/ModelPicker';
import { ProviderLogo } from '@/components/chat/ProviderLogo';
import { cleanModelName, providerKey, providerName } from '@/lib/provider-meta';
import { cn, fmtNum } from '@/lib/utils';

const short = (model?: PickerModel) => cleanModelName(model?.name);

/**
 * Display-only relative band based on the catalogue's average input/output rate.
 * Actual wallet deductions continue to use the provider's reported request cost.
 * These bands align with the app's existing model price tiers.
 */
function usageMultiplier(model: PickerModel): 1 | 2 | 4 | null {
  if (model.id === 'auto') return null;
  const averagePerMillion = (Math.max(0, model.pricePromptPerM) + Math.max(0, model.priceCompletionPerM)) / 2;
  if (averagePerMillion < 1.5) return 1;
  if (averagePerMillion < 12) return 2;
  return 4;
}

function perMillion(value: number) {
  return '$' + (value < 0.01 ? value.toFixed(4) : value.toFixed(2)) + '/M';
}

/** Provider-first model picker with per-model usage-rate indicators. */
export function ModelBar({
  models, selected, onToggle, max, disabled, compareAvailable = false, compareMode = false, onCompareModeChange,
}: {
  models: PickerModel[];
  selected: string[];
  onToggle: (id: string) => void;
  max: number;
  disabled?: boolean;
  compareAvailable?: boolean;
  compareMode?: boolean;
  onCompareModeChange?: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<'all' | 'free' | 'vision'>('all');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(100);
  const ref = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const providerGroups = useMemo(() => {
    const groups = new Map<string, PickerModel[]>();
    models.forEach((model) => {
      const key = providerKey(model.provider);
      const current = groups.get(key) ?? [];
      current.push(model);
      groups.set(key, current);
    });
    return [...groups.entries()]
      .map(([id, items]) => ({ id, items }))
      .sort((a, b) => providerName(a.id).localeCompare(providerName(b.id)));
  }, [models]);
  const actualCompareLimit = Math.max(1, max);

  useEffect(() => { setVisibleLimit(100); }, [q, chip, selectedProvider]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const filteredProviders = useMemo(() => {
    const search = q.trim().toLowerCase();
    return providerGroups.map((group) => {
      const items = group.items.filter((model) => chip === 'free' ? model.isFree : chip === 'vision' ? model.vision : true);
      const providerMatches = providerName(group.id).toLowerCase().includes(search) || group.id.toLowerCase().includes(search);
      const modelMatches = items.some((model) => model.name.toLowerCase().includes(search) || model.id.toLowerCase().includes(search));
      return { ...group, items, matches: !search || providerMatches || modelMatches };
    }).filter((group) => group.items.length > 0 && group.matches);
  }, [providerGroups, chip, q]);

  const list = useMemo(() => {
    const search = q.trim().toLowerCase();
    return models
      .filter((model) => providerKey(model.provider) === selectedProvider)
      .filter((model) => chip === 'free' ? model.isFree : chip === 'vision' ? model.vision : true)
      .filter((model) => !search || model.name.toLowerCase().includes(search) || model.id.toLowerCase().includes(search));
  }, [models, q, chip, selectedProvider]);

  const compareEnabled = compareAvailable && actualCompareLimit > 1;

  function openPicker() {
    setSelectedProvider(null);
    setQ('');
    setChip('all');
    setOpen(true);
  }

  function chooseProvider(provider: string) {
    setSelectedProvider(provider);
    setQ('');
  }

  function chooseModel(id: string) {
    onToggle(id);
    if (!compareMode) setOpen(false);
  }

  return (
    <div ref={ref} className="relative flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <AnimatePresence initial={false}>
            {selected.map((id) => (
              <motion.span key={id} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                className="flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-accent py-1 pl-2 pr-2.5 text-xs font-semibold text-accent-foreground">
                <ProviderLogo provider={byId.get(id)?.provider} className="!h-4 !w-4 !rounded-md" /><span className="max-w-[10rem] truncate">{short(byId.get(id)) || id}</span>
                {compareMode && selected.length > 1 && !disabled && <button type="button" onClick={() => onToggle(id)} aria-label={'Remove ' + (short(byId.get(id)) || id)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-primary/20"><X className="h-3 w-3" /></button>}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center rounded-full border border-border bg-muted/50 p-0.5">
          <button type="button" disabled={disabled} onClick={() => onCompareModeChange?.(false)}
            className={cn('flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition', !compareMode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            aria-pressed={!compareMode} title="Use one model">
            <MessageSquare className="h-3 w-3" />Single
          </button>
          {compareEnabled ? (
            <button type="button" disabled={disabled} onClick={() => onCompareModeChange?.(true)}
              className={cn('flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition', compareMode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              aria-pressed={compareMode} title={'Compare up to ' + actualCompareLimit + ' models'}>
              <GitCompareArrows className="h-3 w-3" />Compare <span className="opacity-75">{selected.length}/{actualCompareLimit}</span>
            </button>
          ) : (
            <Link href="/plans" className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Compare mode needs an eligible plan">
              <GitCompareArrows className="h-3 w-3" />Compare <Lock className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <button type="button" disabled={disabled} onClick={() => open ? setOpen(false) : openPicker()}
          className="flex min-w-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />{compareMode ? 'Add model' : 'Choose AI provider'}<ChevronDown className={cn('h-3 w-3 transition', open && 'rotate-180')} />
        </button>
        <span className="truncate text-[10px] text-muted-foreground">{models.length.toLocaleString()} models · {compareMode ? 'choose up to ' + actualCompareLimit : 'one model per reply'}</span>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 7, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.985 }} transition={{ duration: 0.14 }}
            className="glass fixed inset-x-3 bottom-28 z-[60] flex max-h-[calc(100dvh-9rem)] min-h-[14rem] flex-col rounded-2xl border border-border bg-card p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:max-h-[min(34rem,calc(100dvh-19rem))] sm:w-[min(36rem,calc(100vw-2rem))]">
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input autoFocus className="input !py-2 !pl-9" placeholder={selectedProvider ? 'Search ' + providerName(selectedProvider) + ' models…' : 'Search an AI provider or model…'} value={q} onChange={(event) => setQ(event.target.value)} />
            </div>

            <div className="my-2 flex shrink-0 flex-wrap items-center gap-1.5">
              {(['all', 'free', 'vision'] as const).map((filter) => (
                <button key={filter} type="button" onClick={() => setChip(filter)} className={cn('rounded-full px-3 py-1 text-xs font-semibold capitalize transition', chip === filter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}>{filter === 'vision' ? 'Vision capable' : filter}</button>
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground">{selectedProvider ? list.length + ' models' : filteredProviders.length + ' providers'}</span>
            </div>

            {selectedProvider ? (
              <>
                <div className="mb-2 flex shrink-0 items-center gap-2 border-b border-border pb-2">
                  <button type="button" onClick={() => { setSelectedProvider(null); setQ(''); }} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                    <ChevronLeft className="h-3.5 w-3.5" />All providers
                  </button>
                  <ProviderLogo provider={selectedProvider} className="!h-6 !w-6 !rounded-lg" /><span className="text-xs font-semibold text-foreground">{providerName(selectedProvider)}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">Select a model</span>
                </div>
                {compareMode && selected.length >= actualCompareLimit && <p className="mb-2 shrink-0 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">You selected the maximum of {actualCompareLimit} models. Remove one above to add another.</p>}
                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                  {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No models match this search. Try another name.</p>}
                  {list.slice(0, visibleLimit).map((model) => {
                    const active = selected.includes(model.id);
                    const atLimit = compareMode && selected.length >= actualCompareLimit && !active;
                    const locked = model.locked || atLimit;
                    const multiplier = usageMultiplier(model);
                    return (
                      <button key={model.id} type="button" disabled={locked || disabled} onClick={() => chooseModel(model.id)}
                        className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition', active ? 'bg-accent' : 'hover:bg-muted', locked && 'cursor-not-allowed opacity-55')}>
                        <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{active && <Check className="h-3.5 w-3.5" />}</span>
                        <ProviderLogo provider={model.provider} className="!h-7 !w-7 !rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{cleanModelName(model.name) || model.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{fmtNum(model.context)} context · {model.isFree ? 'Free provider rate' : 'Input ' + perMillion(model.pricePromptPerM) + ' · Output ' + perMillion(model.priceCompletionPerM)}</span>
                        </span>
                        {model.vision && <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Vision capable" />}
                        <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold tabular-nums', multiplier === null ? 'bg-muted text-muted-foreground' : multiplier === 1 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : multiplier === 2 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
                          {multiplier === null ? 'Variable' : multiplier + '× usage'}
                        </span>
                        {model.isFree && <span className="badge">Free</span>}
                        {model.locked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : atLimit ? <span className="text-[10px] text-muted-foreground">Limit</span> : active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  <span>Usage band is based on average input/output rates; final credits use actual provider cost.</span>
                  <div className="flex items-center gap-1">
                    {list.length > visibleLimit && <button type="button" onClick={() => setVisibleLimit((limit) => limit + 100)} className="rounded-lg px-2 py-1 font-semibold text-primary hover:bg-accent">Show 100 more</button>}
                    <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 font-semibold hover:bg-muted hover:text-foreground">{compareMode ? 'Done' : 'Close'}</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex shrink-0 items-center justify-between px-1">
                  <span className="text-xs font-semibold text-foreground">Choose an AI provider</span>
                  <span className="text-[10px] text-muted-foreground">Models appear in the next step</span>
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                  {filteredProviders.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No providers match this search.</p>}
                  {filteredProviders.map((group) => {
                    const selectedCount = group.items.filter((model) => selected.includes(model.id)).length;
                    const availableCount = group.items.filter((model) => !model.locked).length;
                    return (
                      <button key={group.id} type="button" onClick={() => chooseProvider(group.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-border hover:bg-muted">
                        <ProviderLogo provider={group.id} className="!h-7 !w-7 !rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{providerName(group.id)}</span>
                          <span className="block text-[11px] text-muted-foreground">{group.items.length} models · {availableCount} available on your plan{selectedCount ? ' · ' + selectedCount + ' selected' : ''}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 shrink-0 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  Choose a provider to browse its models, prices and usage multipliers.
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
