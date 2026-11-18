'use client';
import { useEffect, useState } from 'react';
import type { PickerModel } from '@/components/chat/ModelPicker';

/** Loads the models this user may see, and remembers the last chosen one. */
export function useModels() {
  const [models, setModels] = useState<PickerModel[]>([]);
  const [modelId, setModelIdState] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/models').then((r) => r.json()).then((j) => {
      if (!alive || !j.models) return;
      setModels(j.models);
      const saved = localStorage.getItem('ilm-model');
      const ok = (id: string | null) => !!id && j.models.some((m: PickerModel) => m.id === id && !m.locked);
      setModelIdState(ok(saved) ? saved! : ok(j.default) ? j.default : j.models.find((m: PickerModel) => !m.locked)?.id ?? '');
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const setModelId = (id: string) => { setModelIdState(id); try { localStorage.setItem('ilm-model', id); } catch { /* ignore */ } };
  return { models, modelId, setModelId, loading };
}
