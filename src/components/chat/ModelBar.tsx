'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, Search, Lock, Eye, Check, Layers, MessageSquare, GitCompareArrows, ChevronDown } from 'lucide-react';
import type { PickerModel } from '@/components/chat/ModelPicker';
import { cn, fmtNum } from '@/lib/utils';

const short=(model?:PickerModel)=>(model?.name??'').replace(/^[^:]+:\s*/,'').replace(/\s*\(free\)/i,'');

/** Searchable provider-aware model picker with an explicit single/compare control. */
export function ModelBar({
  models,selected,onToggle,max,disabled,compareAvailable=false,compareMode=false,onCompareModeChange,
}:{
  models:PickerModel[];
  selected:string[];
  onToggle:(id:string)=>void;
  max:number;
  disabled?:boolean;
  compareAvailable?:boolean;
  compareMode?:boolean;
  onCompareModeChange?:(enabled:boolean)=>void;
}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState('');
  const [chip,setChip]=useState<'all'|'free'|'vision'>('all');
  const [provider,setProvider]=useState('all');
  const ref=useRef<HTMLDivElement>(null);
  const byId=useMemo(()=>new Map(models.map((model)=>[model.id,model])),[models]);
  const providers=useMemo(()=>['all',...Array.from(new Set(models.map((model)=>model.provider))).sort((a,b)=>a.localeCompare(b))],[models]);
  const actualCompareLimit=Math.max(1,max);

  useEffect(()=>{
    const onPointer=(event:MouseEvent)=>{
      if(!ref.current?.contains(event.target as Node))setOpen(false);
    };
    document.addEventListener('mousedown',onPointer);
    return ()=>document.removeEventListener('mousedown',onPointer);
  },[]);

  const list=useMemo(()=>{
    const search=q.trim().toLowerCase();
    return models
      .filter((model)=>provider==='all'||model.provider===provider)
      .filter((model)=>chip==='free'?model.isFree:chip==='vision'?model.vision:true)
      .filter((model)=>!search||model.name.toLowerCase().includes(search)||model.id.toLowerCase().includes(search)||model.provider.toLowerCase().includes(search));
  },[models,q,chip,provider]);

  const compareEnabled=compareAvailable&&actualCompareLimit>1;

  return (
    <div ref={ref} className="relative flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <AnimatePresence initial={false}>
            {selected.map((id)=>(
              <motion.span key={id} layout initial={{opacity:0,scale:0.85}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.85}}
                className="flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-accent py-1 pl-3 pr-1.5 text-xs font-semibold text-accent-foreground">
                <span className="max-w-[10rem] truncate">{short(byId.get(id))||id}</span>
                {compareMode&&selected.length>1&&!disabled&&<button type="button" onClick={()=>onToggle(id)} aria-label={'Remove '+(short(byId.get(id))||id)} className="grid h-4.5 w-4.5 place-items-center rounded-full hover:bg-primary/20"><X className="h-3 w-3"/></button>}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center rounded-full border border-border bg-muted/50 p-0.5">
          <button type="button" disabled={disabled} onClick={()=>onCompareModeChange?.(false)}
            className={cn('flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition',!compareMode?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:text-foreground')}
            aria-pressed={!compareMode} title="Use one model">
            <MessageSquare className="h-3 w-3"/>Single
          </button>
          {compareEnabled?(
            <button type="button" disabled={disabled} onClick={()=>onCompareModeChange?.(true)}
              className={cn('flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition',compareMode?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:text-foreground')}
              aria-pressed={compareMode} title={'Compare up to '+actualCompareLimit+' models'}>
              <GitCompareArrows className="h-3 w-3"/>Compare <span className="opacity-75">{selected.length}/{actualCompareLimit}</span>
            </button>
          ):(
            <Link href="/plans" className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Compare mode needs an eligible plan">
              <GitCompareArrows className="h-3 w-3"/>Compare <Lock className="h-3 w-3"/>
            </Link>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <button type="button" disabled={disabled} onClick={()=>setOpen(value=>!value)}
          className="flex min-w-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50">
          <Plus className="h-3.5 w-3.5"/>{compareMode?'Add model':'Change model'}<ChevronDown className={cn('h-3 w-3 transition',open&&'rotate-180')}/>
        </button>
        <span className="truncate text-[10px] text-muted-foreground">{models.length.toLocaleString()} available in catalogue · {compareMode?'choose up to '+actualCompareLimit:'one model per reply'}</span>
      </div>

      <AnimatePresence>
        {open&&(
          <motion.div initial={{opacity:0,y:7,scale:0.985}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:5,scale:0.985}} transition={{duration:0.14}}
            className="glass fixed bottom-28 left-3 right-3 z-[60] rounded-2xl border border-border bg-card p-2 shadow-2xl sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 sm:w-[min(34rem,calc(100vw-2rem))]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
              <input autoFocus className="input !py-2 !pl-9" placeholder="Search every enabled model or provider…" value={q} onChange={(event)=>setQ(event.target.value)}/>
            </div>
            <div className="my-2 flex flex-wrap items-center gap-1.5">
              {(['all','free','vision'] as const).map((filter)=>(
                <button key={filter} type="button" onClick={()=>setChip(filter)} className={cn('rounded-full px-3 py-1 text-xs font-semibold capitalize transition',chip===filter?'bg-primary text-primary-foreground':'bg-muted text-muted-foreground hover:bg-accent')}>{filter==='vision'?'Vision capable':filter}</button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                Provider
                <select className="max-w-[10rem] rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary" value={provider} onChange={(event)=>setProvider(event.target.value)}>
                  {providers.map((item)=><option key={item} value={item}>{item==='all'?'All providers':item.split(/[-_\s]+/).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ')}</option>)}
                </select>
              </label>
            </div>
            {compareMode&&selected.length>=actualCompareLimit&&<p className="mb-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">You selected the maximum of {actualCompareLimit} models. Remove one above to add another.</p>}
            <div className="max-h-[min(24rem,56vh)] space-y-0.5 overflow-y-auto">
              {list.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">No models match this search. Try another provider or search term.</p>}
              {list.map((model)=>{
                const active=selected.includes(model.id);
                const atLimit=compareMode&&selected.length>=actualCompareLimit&&!active;
                const locked=model.locked||atLimit;
                return (
                  <button key={model.id} type="button" disabled={locked||disabled} onClick={()=>{onToggle(model.id);if(!compareMode)setOpen(false);}}
                    className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',active?'bg-accent':'hover:bg-muted',locked&&'cursor-not-allowed opacity-55')}>
                    <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition',active?'border-primary bg-primary text-primary-foreground':'border-border')}>{active&&<Check className="h-3.5 w-3.5"/>}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{model.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{model.provider} · {fmtNum(model.context)} ctx{model.isFree?' · Free':` · $${model.pricePromptPerM.toFixed(2)}/M in · $${model.priceCompletionPerM.toFixed(2)}/M out`}</span>
                    </span>
                    {model.vision&&<Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Vision capable"/>}
                    {model.isFree?<span className="badge">Free</span>:<span className="badge uppercase">{model.tier}</span>}
                    {model.locked?<Lock className="h-3.5 w-3.5 shrink-0"/>:atLimit?<span className="text-[10px] text-muted-foreground">Limit</span>:active&&<Check className="h-4 w-4 shrink-0 text-primary"/>}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
              <span>Showing {list.length.toLocaleString()} matching models · locked models need an upgrade</span>
              <button type="button" onClick={()=>setOpen(false)} className="rounded-lg px-2 py-1 font-semibold hover:bg-muted hover:text-foreground">Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
