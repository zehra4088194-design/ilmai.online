'use client';
import { useCallback, useEffect, useState } from 'react';
import type { PickerModel } from '@/components/chat/ModelPicker';

/**
 * Loads the models this user may see and keeps the SELECTION (1..maxParallel models) in localStorage.
 * With one model selected the chat behaves like a normal chat; with several it answers side by side.
 */
export function useModels() {
  const [models, setModels] = useState<PickerModel[]>([]);
  const [selected, setSelectedState] = useState<string[]>([]);
  const [maxParallel, setMax] = useState(1);
  const [multi, setMulti] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/models').then((r) => r.json()).then((j) => {
      if (!alive || !j.models) return;
      const list = j.models as PickerModel[];
      const usable = (id: string) => list.some((m) => m.id === id && !m.locked);
      setModels(list); setMulti(!!j.multi); setMax(j.maxParallel ?? 1);
      let saved: string[] = [];
      try { saved = JSON.parse(localStorage.getItem('ilm-models') ?? '[]'); } catch { /* ignore */ }
      let sel = saved.filter(usable).slice(0, j.maxParallel ?? 1);
      if (!sel.length) { const d = usable(j.default) ? j.default : list.find((m) => !m.locked)?.id; sel = d ? [d] : []; }
      setSelectedState(sel);
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const persist = (ids: string[]) => { setSelectedState(ids); try { localStorage.setItem('ilm-models', JSON.stringify(ids)); } catch { /* ignore */ } };
  const toggle = useCallback((id: string) => {
    setSelectedState((cur) => {
      let next: string[];
      if (cur.includes(id)) next = cur.length > 1 ? cur.filter((x) => x !== id) : cur;           // keep at least one
      else next = maxParallel <= 1 ? [id] : cur.length >= maxParallel ? [...cur.slice(1), id] : [...cur, id]; // single mode swaps
      try { localStorage.setItem('ilm-models', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [maxParallel]);

  return { models, selected, setSelected: persist, toggle, maxParallel, multi, loading };
}
