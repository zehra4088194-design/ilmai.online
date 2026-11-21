'use client';
import { useEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { iconFor } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { UserFeature } from '@/lib/features';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import type { Attachment } from '@/lib/attachment-validation';

const COMPOSER_FEATURES = ['quiz', 'web_search', 'voice_input'];

export function Composer({ value, onChange, onSend, onStop, busy, uploading = false, features, onUnavailable, onQuiz,
  attachments = [], onAttachmentsChange, onUploadingChange, placeholder = 'Message Ilm AI…' }: {
  value: string; onChange: (v: string) => void; onSend: () => void; onStop: () => void; busy: boolean;
  uploading?: boolean; features: UserFeature[]; onUnavailable: (f: UserFeature) => void;
  onQuiz?: () => void; attachments?: Attachment[]; onAttachmentsChange?: (files: Attachment[]) => void;
  onUploadingChange?: (uploading: boolean) => void; placeholder?: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const extras = features.filter((f) => COMPOSER_FEATURES.includes(f.key) && (f.key !== 'quiz' || (f.state === 'active' && onQuiz)));
  const uploadFeature = features.find((f) => f.key === 'file_upload');

  return (
    <div className="glass mx-auto w-full max-w-3xl rounded-3xl p-2.5 shadow-soft transition focus-within:shadow-glow">
      {uploadFeature?.state === 'active' && onAttachmentsChange && (
        <AttachmentPicker value={attachments} onChange={onAttachmentsChange} disabled={busy} onUploadingChange={onUploadingChange} />
      )}
      <textarea ref={ta} rows={1} dir="auto" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy && !uploading) onSend(); } }}
        className="max-h-52 w-full resize-none bg-transparent px-3 py-2 text-[0.95rem] outline-none placeholder:text-muted-foreground/70" />
      <div className="flex items-center gap-1 px-1 pt-1">
        {extras.map((f) => {
          const Icon = iconFor(f.icon);
          return (
            <button key={f.key} type="button" title={f.key === 'quiz' ? 'Create a quiz' : f.state === 'active' ? f.label : (f.label + ' – coming soon')} onClick={() => (f.key === 'quiz' ? onQuiz?.() : onUnavailable(f))}
              className={cn('btn-ghost h-9 w-9 !p-0', f.state !== 'active' && f.key !== 'quiz' && 'opacity-50')}><Icon className="h-[18px] w-[18px]" /></button>
          );
        })}
        <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">Enter to send · Shift+Enter for new line</span>
        <div className="ml-auto">
          {busy ? (
            <button onClick={onStop} className="btn-primary h-10 w-10 !rounded-full !p-0" aria-label="Stop"><Square className="h-4 w-4 fill-current" /></button>
          ) : (
            <button onClick={onSend} disabled={uploading || (!value.trim() && attachments.length === 0)} className="btn-primary h-10 w-10 !rounded-full !p-0" aria-label="Send">
              {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <ArrowUp className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
