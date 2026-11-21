'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, AlertTriangle, Pencil, RotateCcw } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { Markdown } from '@/components/chat/Markdown';
import { QuizCard } from '@/components/quiz/QuizCard';
import { AttachmentLinks } from '@/components/AttachmentPicker';
import { cn } from '@/lib/utils';
import type { Group, Msg } from '@/components/chat/types';

const shortName = (id: string | null | undefined, names: Map<string, string>) => (id ? (names.get(id) ?? id.split('/').pop() ?? id) : '');

function Answer({ m, label, boxed }: { m: Msg; label: string; boxed: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn('group min-w-0', boxed ? 'card min-w-[86%] snap-center p-3.5 md:min-w-0' : 'flex gap-3')}>
      {!boxed && <div className="mt-0.5 shrink-0"><LogoMark className="h-8 w-8" /></div>}
      <div className="min-w-0 flex-1">
        <p className={cn('mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground', boxed && 'border-b border-border pb-2')}>
          {boxed && <LogoMark className="h-4 w-4" />}<span className="truncate">{label}</span>{m.streaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
        </p>
        {m.error ? (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{m.content}</div>
        ) : m.content ? (
          <div className={cn(m.streaming && '[&>.md>*:last-child]:cursor')}><Markdown>{m.content}</Markdown></div>
        ) : (
          <div className="flex items-center gap-1.5 py-2">{[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-primary" animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }} />)}</div>
        )}
        {!m.streaming && !m.error && m.content && (
          <button className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100"
            onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

export function TurnView({ group, names, onAsk, onNewQuiz, onEdit }: { group: Group; names: Map<string, string>; onAsk: (t: string) => void; onNewQuiz: (topic: string) => void; onEdit: (t: string) => void }) {
  if (group.quiz?.meta?.quiz_id) return <QuizCard quizId={group.quiz.meta.quiz_id} onAsk={onAsk} onNewQuiz={onNewQuiz} />;
  const n = group.answers.length;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {group.user && (
        <div className="mx-auto flex w-full max-w-3xl justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.93rem] leading-relaxed text-primary-foreground shadow-soft">
            {group.user.content && <div dir="auto" className="whitespace-pre-wrap">{group.user.content}</div>}
            {group.user.attachments?.length ? <div className="mt-2"><AttachmentLinks value={group.user.attachments} /></div> : null}
          </div>
        </div>
      )}
      {n === 1 && <div className="mx-auto w-full max-w-3xl"><Answer m={group.answers[0]} label={shortName(group.answers[0].model, names)} boxed={false} /></div>}
      {n > 1 && (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 md:grid md:overflow-visible md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ ['--cols' as string]: Math.min(n, 4) }}>
          {group.answers.map((a) => <Answer key={a.id} m={a} label={shortName(a.model, names)} boxed />)}
        </div>
      )}
      {group.user?.content && group.answers.some(a => !a.streaming && !a.error && a.content) && (
        <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-1 pl-11">
          <button type="button" onClick={() => onEdit(group.user!.content)} className="btn-ghost h-8 !px-2.5 text-xs"><Pencil className="h-3.5 w-3.5"/>Edit prompt</button>
          <button type="button" onClick={() => onAsk(group.user!.content)} className="btn-ghost h-8 !px-2.5 text-xs"><RotateCcw className="h-3.5 w-3.5"/>Try again</button>
        </div>
      )}
    </motion.div>
  );
}
