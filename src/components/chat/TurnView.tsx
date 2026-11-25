'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, AlertTriangle, RotateCcw, Shuffle, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { ProviderLogo } from '@/components/chat/ProviderLogo';
import { LoadingIndicator } from '@/components/chat/LoadingIndicator';
import { providerFromModelId, providerName } from '@/lib/provider-meta';
import { Markdown } from '@/components/chat/Markdown';
import { QuizCard } from '@/components/quiz/QuizCard';
import { AttachmentLinks } from '@/components/AttachmentPicker';
import { cn } from '@/lib/utils';
import type { Group, Msg } from '@/components/chat/types';

type ComparisonLayout = 'portrait' | 'landscape';

const shortName = (id: string | null | undefined, names: Map<string, string>) => (id ? (names.get(id) ?? id.split('/').pop() ?? id) : '');

function Answer({ m, label, boxed, layout, prompt, onRetry, onDifferentModel }: { m: Msg; label: string; boxed: boolean; layout: ComparisonLayout; prompt: string; onRetry: (text:string)=>void; onDifferentModel: (text:string)=>void }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up'|'down'|null>(null);
  const provider = providerFromModelId(m.model);
  const autoRouted = m.meta?.requested_model === 'auto';
  const answerLogo = autoRouted ? 'ilmai' : provider;
  return (
    <div className={cn(
      'group min-w-0',
      boxed
        ? cn('card min-w-0 p-3.5', layout === 'landscape' && 'w-[min(88vw,36rem)] max-w-[36rem] shrink-0 snap-start')
        : 'flex gap-3',
    )}>
      {!boxed && <div className="mt-0.5 shrink-0">{answerLogo ? <ProviderLogo provider={answerLogo} className="!h-8 !w-8" /> : <LogoMark className="h-8 w-8" />}</div>}
      <div className="min-w-0 flex-1">
        <p className={cn('mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground', boxed && 'border-b border-border pb-2')}>
          {boxed && (answerLogo ? <ProviderLogo provider={answerLogo} className="!h-5 !w-5" /> : <LogoMark className="h-4 w-4" />)}<span className="truncate">{label}</span>{autoRouted && provider && <span className="shrink-0 font-medium normal-case">via {providerName(provider)}</span>}{m.streaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
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

export function TurnView({
  group,
  names,
  onAsk,
  onNewQuiz,
  onDifferentModel,
  onMakeComparisonSummary,
  comparisonSummaryLoading = false,
}: {
  group: Group;
  names: Map<string, string>;
  onAsk: (t: string) => void;
  onNewQuiz: (topic: string) => void;
  onDifferentModel: (t: string) => void;
  onMakeComparisonSummary: (turnId: string, answerIds: string[]) => void;
  comparisonSummaryLoading?: boolean;
}) {
  const [comparisonLayout, setComparisonLayout] = useState<ComparisonLayout>('portrait');
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<string[]>(() => group.answers.map((answer) => answer.id));
  if (group.quiz?.meta?.quiz_id) return <QuizCard quizId={group.quiz.meta.quiz_id} onAsk={onAsk} onNewQuiz={onNewQuiz} />;
  const n = group.answers.length;
  const eligibleAnswers = group.answers.filter((answer) => !answer.streaming && !answer.error && answer.content.trim().length > 0);
  const selectedAnswers = eligibleAnswers.filter((answer) => selectedAnswerIds.includes(answer.id));
  const summaryOwner = group.answers.find((answer) => {
    if (typeof answer.meta?.comparison_summary !== 'string' || answer.meta.comparison_summary.length === 0) return false;
    const storedIds = answer.meta.comparison_summary_answer_ids;
    if (Array.isArray(storedIds)) {
      const ids = storedIds.filter((id): id is string => typeof id === 'string');
      return ids.length === selectedAnswers.length && ids.every((id) => selectedAnswers.some((selected) => selected.id === id));
    }
    return selectedAnswers.length > 0 && selectedAnswers.length === eligibleAnswers.length;
  });
  const comparisonSummary = typeof summaryOwner?.meta?.comparison_summary === 'string' ? summaryOwner.meta.comparison_summary : null;
  const summaryMatchesSelection = !!comparisonSummary;
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
      {n === 1 && <div className="mx-auto w-full"><Answer m={group.answers[0]} label={shortName(group.answers[0].model, names)} boxed={false} layout="portrait" prompt={group.user?.content ?? ''} onRetry={onAsk} onDifferentModel={onDifferentModel} /></div>}
      {n > 1 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Comparison layout</p>
              <p className="text-[11px] text-muted-foreground">Change the layout for this comparison only</p>
            </div>
            <div role="group" aria-label="Comparison layout" className="flex items-center rounded-xl border border-border bg-muted/50 p-1">
              <button type="button" onClick={() => setComparisonLayout('portrait')} aria-pressed={comparisonLayout === 'portrait'}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', comparisonLayout === 'portrait' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Portrait</button>
              <button type="button" onClick={() => setComparisonLayout('landscape')} aria-pressed={comparisonLayout === 'landscape'}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', comparisonLayout === 'landscape' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Landscape</button>
            </div>
          </div>
          <div className={cn(
            '-mx-1 flex gap-3 px-1 pb-2',
            comparisonLayout === 'portrait'
              ? 'flex-col'
              : 'flex-nowrap snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-3',
          )}>
            {group.answers.map((a) => <Answer key={a.id} m={a} label={shortName(a.model, names)} boxed layout={comparisonLayout} prompt={group.user?.content ?? ''} onRetry={onAsk} onDifferentModel={onDifferentModel} />)}
          </div>

          <section className="rounded-2xl border border-border bg-card/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> Make a summary
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">Use all responses or select only the answers you want to summarize.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setSelectedAnswerIds(eligibleAnswers.map((answer) => answer.id))}
                  disabled={eligibleAnswers.length === 0 || comparisonSummaryLoading}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-accent disabled:opacity-40">Select all</button>
                <button type="button" onClick={() => setSelectedAnswerIds([])}
                  disabled={selectedAnswerIds.length === 0 || comparisonSummaryLoading}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-40">Clear</button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {eligibleAnswers.map((answer) => {
                const checked = selectedAnswerIds.includes(answer.id);
                return (
                  <label key={answer.id} className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition',
                    checked ? 'border-primary/40 bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-primary/30',
                  )}>
                    <input type="checkbox" checked={checked} disabled={comparisonSummaryLoading}
                      onChange={(event) => setSelectedAnswerIds((current) => event.target.checked
                        ? [...current, answer.id]
                        : current.filter((id) => id !== answer.id))}
                      className="h-3.5 w-3.5 accent-primary" />
                    <span className="max-w-[14rem] truncate">{shortName(answer.model, names) || 'AI response'}</span>
                  </label>
                );
              })}
              {eligibleAnswers.length === 0 && (
                <p className="text-xs text-muted-foreground">Your model responses will appear here when they finish.</p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">{selectedAnswers.length} of {eligibleAnswers.length} responses selected</span>
              <button type="button" disabled={selectedAnswers.length === 0 || comparisonSummaryLoading}
                onClick={() => onMakeComparisonSummary(group.key, selectedAnswers.map((answer) => answer.id))}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" />
                {comparisonSummaryLoading ? 'Making summary…' : summaryMatchesSelection ? 'Regenerate summary' : 'Make summary'}
              </button>
            </div>

            {comparisonSummary && summaryMatchesSelection && (
              <div className="mt-4 border-t border-border pt-4">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Summary</h4>
                <div className="text-sm leading-relaxed"><Markdown>{comparisonSummary}</Markdown></div>
              </div>
            )}
          </section>
        </>
      )}
    </motion.div>
  );
}
