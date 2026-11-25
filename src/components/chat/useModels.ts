'use client';
import { useCallback, useEffect, useState } from 'react';
import type { PickerModel } from '@/components/chat/ModelPicker';

/**
 * Loads the enabled catalogue models and keeps single/compare mode and model selection
 * on this browser. Single mode always runs exactly one model; compare mode allows
 * up to the admin-configured concurrent model limit when the account has that feature.
 */
export function useModels() {
  const [models, setModels] = useState<PickerModel[]>([]);
  const [selected, setSelectedState] = useState<string[]>([]);
  const [maxParallel, setMax] = useState(1);
  const [multi, setMulti] = useState(false);
  const [compareMode, setCompareModeState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    fetch('/api/models', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string'
              ? payload.error
              : `Could not load models (${response.status})`,
          );
        }
        if (!payload || !Array.isArray(payload.models)) {
          throw new Error('The model service returned an invalid response.');
        }
        return payload;
      })
      .then((j) => {
        if (!alive) return;
        const list = j.models as PickerModel[];
        const compareAllowed = !!j.multi;
        const limit = Math.max(1, Math.min(25, Number(j.maxParallel) || 1));
        setModels(list);
        setMulti(compareAllowed);
        setMax(limit);

        let saved: string[] = [];
        let savedCompare = false;
        try {
          const parsed: unknown = JSON.parse(localStorage.getItem('ilm-models') ?? '[]');
          saved = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
          savedCompare = localStorage.getItem('ilm-model-mode') === 'compare';
        } catch {
          // Local storage is optional.
        }

        const usable = (id: string) => list.some((model) => model.id === id && !model.locked);
        const mode = savedCompare && compareAllowed;
        setCompareModeState(mode);
        const chosen = saved.filter(usable).slice(0, mode ? limit : 1);
        if (chosen.length) {
          setSelectedState(chosen);
        } else {
          const fallback = usable(j.default)
            ? j.default
            : list.find((model) => !model.locked)?.id;
          setSelectedState(fallback ? [fallback] : []);
        }
      })
      .catch((reason) => {
        if (!alive) return;
        setModels([]);
        setSelectedState([]);
        setError(reason instanceof Error ? reason.message : 'Could not load the AI model catalogue.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [retryKey]);

  const persist = (ids: string[]) => {
    setSelectedState(ids);
    try {
      localStorage.setItem('ilm-models', JSON.stringify(ids));
    } catch {
      // Local storage is optional.
    }
  };

  const setCompareMode = useCallback((enabled: boolean) => {
    const next = enabled && multi;
    setCompareModeState(next);
    try {
      localStorage.setItem('ilm-model-mode', next ? 'compare' : 'single');
    } catch {
      // Local storage is optional.
    }
    if (!next) {
      setSelectedState((current) => {
        const one = current.slice(0, 1);
        try {
          localStorage.setItem('ilm-models', JSON.stringify(one));
        } catch {
          // Local storage is optional.
        }
        return one;
      });
    }
  }, [multi]);

  const toggle = useCallback((id: string) => {
    setSelectedState((current) => {
      let next: string[];
      if (current.includes(id)) {
        if (current.length <= 1) return current;
        next = current.filter((value) => value !== id);
      } else {
        const limit = compareMode && multi ? maxParallel : 1;
        if (limit <= 1) next = [id];
        else if (current.length >= limit) return current;
        else next = [...current, id];
      }
      try {
        localStorage.setItem('ilm-models', JSON.stringify(next));
      } catch {
        // Local storage is optional.
      }
      return next;
    });
  }, [maxParallel, compareMode, multi]);

  return {
    models,
    selected,
    setSelected: persist,
    toggle,
    maxParallel,
    multi,
    compareMode,
    setCompareMode,
    loading,
    error,
    retry,
  };
}
