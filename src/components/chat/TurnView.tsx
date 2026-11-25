'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, AlertTriangle, RotateCcw, Shuffle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { ProviderLogo } from '@/components/chat/ProviderLogo';
import { LoadingIndicator } from '@/components/chat/LoadingIndicator';
import { providerFromModelId } from '@/lib/provider-meta';
import { Markdown } from '@/components/chat/Markdown';
import { QuizCard } from '@/components/quiz/QuizCard';
import { AttachmentLinks } from '@/components/AttachmentPicker';
import { cn } from '@/lib/utils';
import type { Group, Msg } from '@/components/chat/types';

const shortName = (id: string | null | undefined, names: Map<string, string>) => (id ? (names.get(id) ?? id.split('/').pop() ?? id) : '');

function Answer({ m, label, boxed, prompt, onRetry, onDifferentModel }: { m: Msg; label: string; boxed: boolean; prompt: string; onRetry: (text:string)=>void; onDifferentModel: (text:string)=>void }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up'|'down'|null>(null);
  const provider = providerFromModelId(m.model);
  return (
    <div className={cn('group min-w-0', boxed ? 'card min-w-[86%] snap-center p-3.5 md:min-w-0' : 'flex gap-3')}>
      {!boxed && <div className="mt-0.5 shrink-0"><LogoMark className="h-8 w-8" /></div>}
      <div className="min-w-0 flex-1">
        <p className={cn('mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground', boxed && 'border-b border-border pb-2')}>
          {boxed && (provider ? <ProviderLogo provider={provider} className="!h-5 !w-5" /> : <LogoMark className="h-4 w-4" />)}<span className="truncate">{label}</span>{m.streaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
        </p>
        {m.error ? (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{m.content}</div>
        ) : m.content ? (
          <div className={cn(m.streaming && '[&>.md>*:last-child]:cursor')}><Markdown>{m.content}</Markdown></div>
        ) : (
          <LoadingIndicator />
        )}
        {!m.streaming && !m.error && m.content && (
          <div className="mt-2 flex flex-wrap items-center gap-1 opacity-70 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} aria-label="Copy answer" title={copied ? 'Copied' : 'Copy'}>{copied ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>}</button>
            <button type="button" onClick={()=>setFeedback(feedback==='up'?null:'up')} className={cn('grid h-8 w-8 place-items-center rounded-lg hover:bg-muted',feedback==='up'?'text-primary':'text-muted-foreground')} aria-label="Helpful answer" title="Helpful"><ThumbsUp className="h-4 w-4"/></button>
            <button type="button" onClick={()=>setFeedback(feedback==='down'?null:'down')} className={cn('grid h-8 w-8 place-items-center rounded-lg hover:bg-muted',feedback==='down'?'text-danger':'text-muted-foreground')} aria-label="Not helpful" title="Not helpful"><ThumbsDown className="h-4 w-4"/></button>
            <button type="button" onClick={()=>onRetry(prompt)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Try again" title="Try again"><RotateCcw className="h-4 w-4"/></button>
            <button type="button" onClick={()=>onDifferentModel(prompt)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Answer with a different model" title="Answer with a different model"><Shuffle className="h-4 w-4"/></button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TurnView({ group, names, onAsk, onNewQuiz, onDifferentModel }: { group: Group; names: Map<string, string>; onAsk: (t: string) => void; onNewQuiz: (topic: string) => void; onDifferentModel: (t: string) => void }) {
  if (group.quiz?.meta?.quiz_id) return <QuizCard quizId={group.quiz.meta.quiz_id} onAsk={onAsk} onNewQuiz={onNewQuiz} />;
  const n = group.answers.length;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {group.user && (
        <div className="mx-auto flex w-full justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[0.93rem] leading-relaxed text-foreground">
            {group.user.content && <div dir="auto" className="whitespace-pre-wrap">{group.user.content}</div>}
            {group.user.attachments?.length ? <div className="mt-2"><AttachmentLinks value={group.user.attachments} /></div> : null}
          </div>
        </div>
      )}
      {n === 1 && <div className="mx-auto w-full"><Answer m={group.answers[0]} label={shortName(group.answers[0].model, names)} boxed={false} prompt={group.user?.content ?? ''} onRetry={onAsk} onDifferentModel={onDifferentModel} /></div>}
      {n > 1 && (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 md:grid md:overflow-visible md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ ['--cols' as string]: Math.min(n, 4) }}>
          {group.answers.map((a) => <Answer key={a.id} m={a} label={shortName(a.model, names)} boxed prompt={group.user?.content ?? ''} onRetry={onAsk} onDifferentModel={onDifferentModel} />)}
        </div>
      )}

    </motion.div>
  );
}
