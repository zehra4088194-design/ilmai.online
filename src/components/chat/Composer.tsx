'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Square, Plus, Paperclip, WandSparkles, Mic, MicOff, PhoneCall, PhoneOff,
  GraduationCap, Globe, ChevronDown, Loader2, X,
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
  onBuildWebsite, callActive = false, onToggleCall,
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
  callActive?: boolean; onToggleCall?: () => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dictating, setDictating] = useState(false);
  const toast = useToast();

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

  return (
    <div className="glass mx-auto w-full max-w-4xl rounded-3xl border border-border/80 bg-card/95 p-2.5 shadow-soft transition focus-within:border-primary/40 focus-within:shadow-glow sm:p-3">
      {modelSlot && <div className="mb-2 flex min-w-0 items-center gap-2 border-b border-border/70 pb-2">{modelSlot}</div>}

      {attachments.length > 0 && onAttachmentsChange && (
        <div className="mb-2 px-1">
          <AttachmentPicker value={attachments} onChange={onAttachmentsChange} disabled={busy || uploading}
            onUploadingChange={onUploadingChange} compact />
        </div>
      )}

      <textarea ref={ta} rows={1} dir="auto" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy && !uploading) onSend(); } }}
        className="max-h-52 min-h-12 w-full resize-none bg-transparent px-3 py-2.5 text-[0.95rem] leading-6 outline-none placeholder:text-muted-foreground/65" />

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
          <button type="button" onClick={toggleDictation} disabled={busy || uploading} aria-label={dictating ? 'Stop dictation' : 'Dictate'}
            title={dictating ? 'Stop dictation' : 'Dictate prompt'}
            className={cn('grid h-9 w-9 place-items-center rounded-full transition hover:bg-muted', dictating ? 'text-danger' : 'text-muted-foreground')}>
            {dictating ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
          </button>
          <button type="button" onClick={onToggleCall} disabled={!onToggleCall || busy || uploading} aria-label={callActive ? 'End voice call' : 'Start voice call'}
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
      <div className="flex items-center justify-between px-2 pt-1.5 text-[10px] text-muted-foreground">
        <span>Enter to send · Shift+Enter for new line</span>
        <span>Attach up to 8 supported files</span>
      </div>
    </div>
  );
}
