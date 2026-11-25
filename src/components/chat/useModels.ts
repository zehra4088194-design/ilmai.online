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
  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState<string | null>(null);\n  const [retryKey, setRetryKey] = useState(0);\n\n  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/models',{cache:'no-store'})
      .then(async (response)=>{
        if(!response.ok) throw new Error('Could not load models');
        return response.json();
      })
      .then((j)=>{
        if(!alive||!Array.isArray(j.models))return;
        const list=j.models as PickerModel[];
        const compareAllowed=!!j.multi;
        const limit=Math.max(1,Math.min(25,Number(j.maxParallel)||1));
        setModels(list);
        setMulti(compareAllowed);
        setMax(limit);

        let saved:string[]=[];
        let savedCompare=false;
        try {
          saved=JSON.parse(localStorage.getItem('ilm-models')??'[]');
          savedCompare=localStorage.getItem('ilm-model-mode')==='compare';
        } catch { /* local storage optional */ }
        const usable=(id:string)=>list.some((m)=>m.id===id&&!m.locked);
        const mode=savedCompare&&compareAllowed;
        setCompareModeState(mode);
        const chosen=saved.filter((id)=>typeof id==='string'&&usable(id)).slice(0,mode?limit:1);
        if(chosen.length) setSelectedState(chosen);
        else {
          const fallback=usable(j.default)?j.default:list.find((m)=>!m.locked)?.id;
          setSelectedState(fallback?[fallback]:[]);
        }
      })
      .catch((reason)=>{\n        if(alive) {\n          setModels([]);\n          setError(reason instanceof Error ? reason.message : 'Could not load the AI model catalogue.');\n        }\n      })
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  }, [retryKey]);

  const persist=(ids:string[])=>{
    setSelectedState(ids);
    try{localStorage.setItem('ilm-models',JSON.stringify(ids));}catch{/* storage optional */}
  };

  const setCompareMode=useCallback((enabled:boolean)=>{
    const next=enabled&&multi;
    setCompareModeState(next);
    try{localStorage.setItem('ilm-model-mode',next?'compare':'single');}catch{/* storage optional */}
    if(!next) {
      setSelectedState((current)=>{
        const one=current.slice(0,1);
        try{localStorage.setItem('ilm-models',JSON.stringify(one));}catch{/* storage optional */}
        return one;
      });
    }
  },[multi]);

  const toggle=useCallback((id:string)=>{
    setSelectedState((current)=>{
      let next:string[];
      if(current.includes(id)) {
        if(current.length<=1)return current;
        next=current.filter((value)=>value!==id);
      } else {
        const limit=compareMode&&multi?maxParallel:1;
        if(limit<=1)next=[id];
        else if(current.length>=limit)return current;
        else next=[...current,id];
      }
      try{localStorage.setItem('ilm-models',JSON.stringify(next));}catch{/* storage optional */}
      return next;
    });
  },[maxParallel,compareMode,multi]);

  return {models,selected,setSelected:persist,toggle,maxParallel,multi,compareMode,setCompareMode,loading,error,retry};
}
