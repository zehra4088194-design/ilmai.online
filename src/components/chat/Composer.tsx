'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Square, Plus, Paperclip, WandSparkles, Mic, MicOff, PhoneCall, PhoneOff,
  GraduationCap, Globe, ChevronDown, Loader2, Lock, Unlock, ChevronUp,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { UserFeature } from '@/lib/features';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import type { Attachment } from '@/lib/attachment-validation';
import { createSpeechRecognition, type SpeechRecognitionLike } from '@/lib/speech';
import { useToast } from '@/components/providers';

export function Composer({
  value, onChange, onSend, onStop, busy, uploading = false, features, onUnavailable, onQuiz,
  attachments = [], onAttachmentsChange, onUploadingChange, placeholder = 'Message Ilm AI…',
  modelSlot, thinking = 'auto', onThinkingChange, onEnhance, enhancing = false,
  onBuildWebsite, callActive = false, callStatus = 'idle', onToggleCall,
}: {
  value: string; onChange: (v: string) => void; onSend: () => void; onStop: () => void; busy: boolean;
  uploading?: boolean; features: UserFeature[]; onUnavailable: (f: UserFeature) => void;
  onQuiz?: () => void; attachments?: Attachment[]; onAttachmentsChange?: (files: Attachment[]) => void;
  onUploadingChange?: (uploading: boolean) => void; placeholder?: string;
  modelSlot?: React.ReactNode;
  thinking?: 'auto' | 'low' | 'medium' | 'high';
  onThinkingChange?: (value: 'auto' | 'low' | 'medium' | 'high') => void;
  onEnhance?: () => void; enhancing?: boolean;
  onBuildWebsite?: () => void;
  callActive?: boolean; callStatus?: 'idle'|'listening'|'thinking'|'speaking'; onToggleCall?: () => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [settled, setSettled] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const [lockMode, setLockMode] = useState<'auto'|'open'|'folded'>('auto');
  const [lockLoaded, setLockLoaded] = useState(false);
  const toast = useToast();

  useEffect(() => {
    try {
      const saved=localStorage.getItem('ilm-composer-lock');
      if(saved==='open'||saved==='folded') {
        setLockMode(saved);
        setCollapsed(saved==='folded');
      }
    } catch { /* local storage optional */ }
    setLockLoaded(true);
  }, []);

  useEffect(() => {
    if(!lockLoaded) return;
    try {
      if(lockMode==='auto') localStorage.removeItem('ilm-composer-lock');
      else localStorage.setItem('ilm-composer-lock',lockMode);
    } catch { /* local storage optional */ }
  }, [lockMode,lockLoaded]);

  useEffect(() => {
    if(!lockLoaded||lockMode!=='auto'||hovered||focused||busy||uploading||value.trim()||attachments.length||menuOpen||dictating) return;
    const timer=window.setTimeout(()=>setCollapsed(true),3000);
    return ()=>window.clearTimeout(timer);
  },[lockLoaded,lockMode,hovered,focused,busy,uploading,value,attachments.length,menuOpen,dictating]);

  // Let dropdowns (model picker, + menu) overflow the box only after the open animation has finished.
  useEffect(() => {
    setSettled(false);
    if (collapsed) return;
    const timer = window.setTimeout(() => setSettled(true), 360);
    return () => window.clearTimeout(timer);
  }, [collapsed]);

  function toggleComposerLock() {
    setLockMode(current=>current==='auto'?(collapsed?'folded':'open'):'auto');
  }

  function handleComposerEnter() {
    setHovered(true);
    if(lockMode!=='folded') setCollapsed(false);
  }

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  useEffect(() => () => {
    try { recognition.current?.abort(); } catch { /* microphone already stopped */ }
  }, []);

  function toggleDictation() {
    if (dictating) {
      recognition.current?.stop();
      setDictating(false);
      return;
    }
    const speech = createSpeechRecognition();
    if (!speech) {
      toast('Voice typing is not supported in this browser. Try Chrome over HTTPS.', 'info');
      return;
    }
    speech.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
    speech.continuous = false;
    speech.interimResults = false;
    speech.maxAlternatives = 1;
    speech.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? '').join(' ').trim();
      if (transcript) onChange([value.trim(), transcript].filter(Boolean).join(value.trim() ? ' ' : ''));
    };
    speech.onerror = (event) => {
      setDictating(false);
      if (event.error !== 'no-speech' && event.error !== 'aborted') toast('Microphone error: ' + (event.error ?? 'please check permissions'), 'err');
    };
    speech.onend = () => setDictating(false);
    recognition.current = speech;
    try { speech.start(); setDictating(true); }
    catch { setDictating(false); toast('Could not start the microphone. Check browser permissions.', 'err'); }
  }

  const uploadFeature = features.find((f) => f.key === 'file_upload');
  const canUpload = uploadFeature?.state === 'active' && !!onAttachmentsChange;
  const quizFeature = features.find((f) => f.key === 'quiz');

  const expanded = !collapsed;

  return (
    <div
      ref={root}
      className="mx-auto w-full max-w-none"
      onMouseEnter={handleComposerEnter}
      onMouseLeave={()=>setHovered(false)}
      onFocusCapture={()=>setFocused(true)}
      onBlurCapture={(event)=>{ if(!root.current?.contains(event.relatedTarget as Node|null)) setFocused(false); }}
    >
      {/* One box that is always mounted: it grows/shrinks smoothly (CSS grid rows) instead of swapping two different components. */}
      <div className={cn(
        'glass relative w-full border border-border/80 bg-card/95 shadow-soft transition-[border-radius,border-color,box-shadow] duration-300 ease-out',
        expanded ? 'rounded-3xl focus-within:border-primary/40 focus-within:shadow-glow' : 'rounded-2xl hover:border-primary/40',
      )}>
        {/* Folded bar */}
        <div className={cn('composer-fold', !expanded && 'is-open')} aria-hidden={expanded} inert={expanded}>
          <div className="composer-fold-inner">
            <div className="flex min-h-14 items-center gap-3 px-3 py-2">
              <button type="button" onClick={()=>{if(lockMode==='folded')setLockMode('auto');setCollapsed(false);}} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Expand message composer" tabIndex={expanded?-1:0}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Plus className="h-4 w-4"/></span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-muted-foreground">{value.trim()?'Draft ready · expand to continue':'Message Ilm AI…'}</span><span className="block text-[10px] text-muted-foreground">Hover or click to expand</span></span>
                <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-muted-foreground"/>
              </button>
              <button type="button" onClick={toggleComposerLock} tabIndex={expanded?-1:0} className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-muted',lockMode!=='auto'?'bg-primary/10 text-primary':'text-muted-foreground')} title={lockMode==='folded'?'Unlock folded composer':lockMode==='open'?'Unlock expanded composer':'Lock composer in its current state'} aria-label="Toggle composer lock">
                {lockMode==='auto'?<Unlock className="h-4 w-4"/>:<Lock className="h-4 w-4"/>}
              </button>
            </div>
          </div>
        </div>

        {/* Full composer */}
        <div className={cn('composer-fold', expanded && 'is-open', expanded && settled && 'is-settled')} aria-hidden={!expanded} inert={!expanded}>
          <div className="composer-fold-inner">
            <div className="p-2.5 sm:p-3">
      {modelSlot && <div className="mb-2 flex min-w-0 items-center gap-2 border-b border-border/70 pb-2">{modelSlot}
        <button type="button" onClick={toggleComposerLock} className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-muted',lockMode!=='auto'?'bg-primary/10 text-primary':'text-muted-foreground')} title={lockMode==='open'?'Unlock expanded composer':'Lock composer open'} aria-label="Toggle composer lock">
          {lockMode==='open'?<Lock className="h-4 w-4"/>:<Unlock className="h-4 w-4"/>}
        </button>
      </div>}

      <textarea ref={ta} rows={1} dir="auto" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy && !uploading) onSend(); } }}
        className="max-h-36 min-h-12 w-full resize-none bg-transparent px-3 py-2.5 text-[0.95rem] leading-6 outline-none placeholder:text-muted-foreground/65" />

      <div className="flex flex-wrap items-center gap-1 border-t border-border/60 px-1 pt-2">
        <div className="relative">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} disabled={busy || uploading}
            className={cn('grid h-9 w-9 place-items-center rounded-full border border-border bg-muted/70 text-foreground transition hover:border-primary/50 hover:bg-accent', menuOpen && 'border-primary/50 bg-accent')}
            aria-label="More actions" aria-expanded={menuOpen}>
            <Plus className={cn('h-[18px] w-[18px] transition-transform', menuOpen && 'rotate-45')} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div initial={{ opacity: 0, y: 7, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.98 }}
                className="absolute bottom-full left-0 z-50 mb-2 w-60 rounded-2xl border border-border bg-card p-1.5 shadow-2xl">
                {onQuiz && quizFeature?.state === 'active' && (
                  <button type="button" onClick={() => { setMenuOpen(false); onQuiz(); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-muted">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><GraduationCap className="h-4 w-4" /></span>
                    <span><span className="block">Create a quiz</span><span className="block text-xs text-muted-foreground">Generate questions from a topic</span></span>
                  </button>
                )}
                <button type="button" onClick={() => { setMenuOpen(false); onBuildWebsite?.(); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-muted">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Globe className="h-4 w-4" /></span>
                  <span><span className="block">Build a Website</span><span className="block text-xs text-muted-foreground">Create a complete project ZIP</span></span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {canUpload ? (
          <AttachmentPicker value={attachments} onChange={onAttachmentsChange!} disabled={busy || uploading}
            onUploadingChange={onUploadingChange} compact
            renderTrigger={(open, disabled) => (
              <button type="button" onClick={open} disabled={disabled} aria-label="Attach files"
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-primary disabled:opacity-40">
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
            )} />
        ) : (
          <button type="button" aria-label="Attach files" onClick={() => uploadFeature && onUnavailable(uploadFeature)}
            disabled={!uploadFeature || busy || uploading} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40">
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
        )}

        <button type="button" onClick={onEnhance} disabled={!onEnhance || !value.trim() || busy || uploading || enhancing}
          title="Enhance prompt" aria-label="Enhance prompt"
          className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-primary disabled:opacity-40">
          {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          <span className="hidden sm:inline">{enhancing ? 'Enhancing…' : 'Enhance'}</span>
        </button>

        <label className="ml-1 flex h-9 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-muted" title="Thinking effort">
          <span className="hidden sm:inline">Thinking</span>
          <select aria-label="Thinking effort" value={thinking} onChange={(e) => onThinkingChange?.(e.target.value as 'auto' | 'low' | 'medium' | 'high')}
            disabled={busy} className="max-w-[6.1rem] bg-transparent text-xs font-semibold text-foreground outline-none">
            <option value="auto">Auto</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <ChevronDown className="h-3 w-3" />
        </label>

        <div className="ml-auto flex items-center gap-1">
          {callActive && <span className="mr-1 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary" aria-live="polite"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />{callStatus === 'speaking' ? 'Speaking' : callStatus === 'thinking' ? 'Thinking' : 'Listening'}</span>}
          <button type="button" onClick={toggleDictation} disabled={busy || uploading} aria-label={dictating ? 'Stop dictation' : 'Dictate'}
            title={dictating ? 'Stop dictation' : 'Dictate prompt'}
            className={cn('grid h-9 w-9 place-items-center rounded-full transition hover:bg-muted', dictating ? 'text-danger' : 'text-muted-foreground')}>
            {dictating ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
          </button>
          <button type="button" onClick={onToggleCall} disabled={!onToggleCall || (!callActive && (busy || uploading))} aria-label={callActive ? 'End voice call' : 'Start voice call'}
            title={callActive ? 'End voice call' : 'Voice call'}
            className={cn('grid h-9 w-9 place-items-center rounded-full transition hover:bg-muted', callActive ? 'bg-danger/10 text-danger' : 'text-muted-foreground')}>
            {callActive ? <PhoneOff className="h-[18px] w-[18px]" /> : <PhoneCall className="h-[18px] w-[18px]" />}
          </button>
          {busy ? (
            <button type="button" onClick={onStop} className="btn-primary h-10 w-10 !rounded-full !p-0" aria-label="Stop response"><Square className="h-4 w-4 fill-current" /></button>
          ) : (
            <button type="button" onClick={onSend} disabled={uploading || (!value.trim() && attachments.length === 0)}
              className="btn-primary h-10 w-10 !rounded-full !p-0" aria-label="Send message">
              {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <ArrowUp className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
