'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X, ArrowRight, RotateCcw, Trophy, Lightbulb, MessageCircleQuestion, Plus, Loader2, Timer } from 'lucide-react';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { QuizQuestion } from '@/lib/quiz';

type QuizData = { id: string; topic: string; config: { count: number; difficulty: string; kind: string; language: string }; questions: QuizQuestion[] };
type Attempt = { answers: number[]; score: number; total: number };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Interactive quiz rendered inside the chat: one question at a time, instant feedback, score, review, retry. */
export function QuizCard({ quizId, onAsk, onNewQuiz }: { quizId: string; onAsk: (text: string) => void; onNewQuiz: (topic: string) => void }) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<'intro' | 'taking' | 'result'>('intro');
  const [order, setOrder] = useState<number[]>([]);      // question indexes being played
  const [pos, setPos] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);  // by question index, -1 = unanswered
  const [revealed, setRevealed] = useState(false);
  const [practice, setPractice] = useState(false);       // retrying wrong ones – not saved as an attempt
  const [saved, setSaved] = useState<Attempt | null>(null);
  const [secs, setSecs] = useState(0);
  const t0 = useRef(0);

  useEffect(() => {
    let alive = true;
    api<{ quiz: QuizData; lastAttempt: Attempt | null }>(`/api/quiz/${quizId}`, 'GET').then((j) => {
      if (!alive) return;
      setQuiz(j.quiz);
      if (j.lastAttempt) { setAnswers(j.lastAttempt.answers); setSaved(j.lastAttempt); setOrder(j.quiz.questions.map((_, i) => i)); setPhase('result'); }
    }).catch((e) => alive && setErr(e instanceof Error ? e.message : 'Could not load the quiz'));
    return () => { alive = false; };
  }, [quizId]);

  const qs = quiz?.questions ?? [];
  const start = (idxs: number[], isPractice: boolean) => {
    setOrder(idxs); setPos(0); setRevealed(false); setPractice(isPractice);
    setAnswers((a) => (isPractice ? a.map((v, i) => (idxs.includes(i) ? -1 : v)) : qs.map(() => -1)));
    t0.current = Date.now(); setPhase('taking');
  };

  const qi = order[pos];
  const cur = qs[qi];
  const pick = (oi: number) => { if (revealed) return; setAnswers((a) => a.map((v, i) => (i === qi ? oi : v))); setRevealed(true); };

  async function next() {
    if (pos + 1 < order.length) { setPos(pos + 1); setRevealed(false); return; }
    const d = Math.round((Date.now() - t0.current) / 1000);
    setSecs(d);
    setPhase('result');
    if (!practice) {
      try {
        const r = await api<{ score: number; total: number }>(`/api/quiz/${quizId}/attempt`, 'POST', { answers, durationS: d });
        setSaved({ answers, score: r.score, total: r.total });
      } catch { /* result still shown locally */ }
    }
  }

  const score = useMemo(() => qs.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0), [qs, answers]);
  const wrong = useMemo(() => qs.map((q, i) => ({ q, i })).filter(({ q, i }) => answers[i] !== q.answer), [qs, answers]);
  const answered = order.filter((i) => answers[i] !== -1).length;
  const shownTotal = practice ? order.length : qs.length;
  const shownScore = practice ? order.filter((i) => answers[i] === qs[i]?.answer).length : score;
  const pct = shownTotal ? Math.round((shownScore / shownTotal) * 100) : 0;

  function explainMistakes() {
    const lines = wrong.slice(0, 8).map(({ q, i }, n) => `${n + 1}. ${q.question}\n   My answer: ${answers[i] >= 0 ? q.options[answers[i]] : '(skipped)'}\n   Correct: ${q.options[q.answer]}`);
    onAsk(`I took a quiz on "${quiz?.topic}" and scored ${score}/${qs.length}. Please explain my mistakes simply and tell me what to revise:\n\n${lines.join('\n')}`);
  }

  if (err) return <div className="card mx-auto max-w-3xl p-4 text-sm text-danger">{err}</div>;
  if (!quiz) return <div className="card mx-auto flex max-w-3xl items-center gap-3 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading quiz…</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card mx-auto w-full max-w-3xl overflow-hidden shadow-soft">
      <div className="flex items-center gap-3 border-b border-border bg-accent/50 px-5 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><MessageCircleQuestion className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><p className="truncate font-bold" dir="auto">{quiz.topic}</p><p className="text-xs capitalize text-muted-foreground">{qs.length} questions · {quiz.config.difficulty} · {quiz.config.kind === 'tf' ? 'true/false' : quiz.config.kind}</p></div>
        {phase === 'taking' && <span className="badge">{pos + 1}/{order.length}</span>}
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6 text-center">
            <p className="text-muted-foreground">Ready? Pick an answer – you will see instantly if it is right, with a short explanation.</p>
            <button className="btn-primary mt-5 !px-6 !py-2.5" onClick={() => start(qs.map((_, i) => i), false)}>Start quiz <ArrowRight className="h-4 w-4" /></button>
          </motion.div>
        )}

        {phase === 'taking' && cur && (
          <motion.div key={`q${pos}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="p-5 sm:p-6">
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" animate={{ width: `${((pos + (revealed ? 1 : 0)) / order.length) * 100}%` }} /></div>
            <h3 dir="auto" className="mb-4 text-lg font-bold leading-snug">{cur.question}</h3>
            <div className="space-y-2.5">
              {cur.options.map((o, oi) => {
                const chosen = answers[qi] === oi;
                const isRight = oi === cur.answer;
                const state = !revealed ? 'idle' : isRight ? 'right' : chosen ? 'wrong' : 'dim';
                return (
                  <button key={oi} disabled={revealed} onClick={() => pick(oi)} dir="auto"
                    className={cn('flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition',
                      state === 'idle' && 'border-border bg-card hover:border-primary/60 hover:bg-accent/60',
                      state === 'right' && 'border-primary bg-primary/10',
                      state === 'wrong' && 'border-danger bg-danger/10',
                      state === 'dim' && 'border-border opacity-55')}>
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold', state === 'right' ? 'bg-primary text-primary-foreground' : state === 'wrong' ? 'bg-danger text-white' : 'bg-muted')}>
                      {state === 'right' ? <Check className="h-4 w-4" /> : state === 'wrong' ? <X className="h-4 w-4" /> : LETTERS[oi]}
                    </span>
                    <span className="flex-1 text-[0.95rem]">{o}</span>
                  </button>
                );
              })}
            </div>
            <AnimatePresence>
              {revealed && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                  <div className={cn('mt-4 flex gap-2.5 rounded-xl p-3.5 text-sm', answers[qi] === cur.answer ? 'bg-primary/10' : 'bg-danger/10')}>
                    <Lightbulb className={cn('mt-0.5 h-4 w-4 shrink-0', answers[qi] === cur.answer ? 'text-primary' : 'text-danger')} />
                    <div dir="auto"><p className="font-bold">{answers[qi] === cur.answer ? 'Correct!' : `Not quite – the answer is ${LETTERS[cur.answer]}.`}</p>{cur.explanation && <p className="mt-0.5 text-muted-foreground">{cur.explanation}</p>}</div>
                  </div>
                  <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={next}>{pos + 1 < order.length ? 'Next question' : 'See results'}<ArrowRight className="h-4 w-4" /></button></div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {phase === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="p-5 sm:p-6">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div className="relative h-28 w-28 shrink-0">
                <svg viewBox="0 0 100 100" className="-rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                  <motion.circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={264} initial={{ strokeDashoffset: 264 }} animate={{ strokeDashoffset: 264 - (264 * pct) / 100 }} transition={{ duration: 1, ease: 'easeOut' }} /></svg>
                <div className="absolute inset-0 grid place-items-center"><div><p className="text-2xl font-extrabold">{pct}%</p><p className="-mt-1 text-xs text-muted-foreground">{shownScore}/{shownTotal}</p></div></div>
              </div>
              <div className="flex-1">
                <p className="flex items-center justify-center gap-2 text-xl font-extrabold sm:justify-start"><Trophy className="h-5 w-5 text-primary" />{pct >= 90 ? 'Outstanding!' : pct >= 70 ? 'Great job!' : pct >= 50 ? 'Good effort – keep going!' : 'Keep practising, you will get there!'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{wrong.length === 0 ? 'Perfect score – every answer was right.' : `${wrong.length} to review.`}{secs > 0 && <span className="ml-2 inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{Math.floor(secs / 60)}m {secs % 60}s</span>}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <button className="btn-outline !py-1.5" onClick={() => start(qs.map((_, i) => i), false)}><RotateCcw className="h-4 w-4" />Retake</button>
                  {wrong.length > 0 && <button className="btn-outline !py-1.5" onClick={() => start(wrong.map((w) => w.i), true)}>Retry wrong ({wrong.length})</button>}
                  {wrong.length > 0 && <button className="btn-primary !py-1.5" onClick={explainMistakes}><Lightbulb className="h-4 w-4" />Explain my mistakes</button>}
                  <button className="btn-ghost !py-1.5" onClick={() => onNewQuiz(quiz.topic)}><Plus className="h-4 w-4" />New quiz</button>
                </div>
              </div>
            </div>
            <details className="mt-5 rounded-xl border border-border">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold">Review all answers</summary>
              <ol className="divide-y divide-border">
                {qs.map((q, i) => { const ok = answers[i] === q.answer; return (
                  <li key={i} className="flex gap-3 px-4 py-3 text-sm">
                    <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white', ok ? 'bg-primary' : 'bg-danger')}>{ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span>
                    <div dir="auto"><p className="font-semibold">{q.question}</p>
                      {!ok && <p className="text-danger">Your answer: {answers[i] >= 0 ? q.options[answers[i]] : 'skipped'}</p>}
                      <p className="text-primary">Correct: {q.options[q.answer]}</p>{q.explanation && <p className="mt-0.5 text-muted-foreground">{q.explanation}</p>}</div>
                  </li>); })}
              </ol>
            </details>
            <p className="hidden">{answered}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
