'use client';
import { useState } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { cn, isUrdu } from '@/lib/utils';

export type QuizCreated = { conversationId: string; messageId?: string; quizId: string; content: string };

function Seg<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
          className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition', value === o.v ? 'bg-primary text-primary-foreground shadow-soft' : 'bg-muted hover:bg-accent')}>{o.label}</button>
      ))}
    </div>
  );
}

/** Form that asks the API for a quiz (free models). The finished quiz becomes a card in the chat. */
export function QuizBuilder({ conversationId, mode, defaultTopic = '', context, onCreated, className }: {
  conversationId?: string | null; mode?: string | null; defaultTopic?: string; context?: string;
  onCreated: (r: QuizCreated) => void; className?: string;
}) {
  const toast = useToast();
  const [topic, setTopic] = useState(defaultTopic);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [kind, setKind] = useState<'mcq' | 'tf' | 'mixed'>('mcq');
  const [language, setLanguage] = useState('Auto');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (topic.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const lang = language === 'Auto' ? (isUrdu(topic) ? 'Urdu' : 'English') : language;
      const r = await api<QuizCreated>('/api/quiz/generate', 'POST', {
        topic: topic.trim(), count, difficulty, kind, language: lang, context, mode: mode ?? null, conversationId: conversationId ?? undefined,
      });
      onCreated(r);
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not create the quiz', 'err'); } finally { setBusy(false); }
  }

  return (
    <div className={cn('space-y-4', className)}>
      <input dir="auto" className="input !py-3 text-base" placeholder="Quiz topic – e.g. Photosynthesis (Class 9 Biology)" value={topic} autoFocus
        onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Questions</p><Seg value={count} onChange={setCount} options={[5, 10, 15, 20].map((n) => ({ v: n, label: String(n) }))} /></div>
        <div><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Difficulty</p><Seg value={difficulty} onChange={setDifficulty} options={[{ v: 'easy', label: 'Easy' }, { v: 'medium', label: 'Medium' }, { v: 'hard', label: 'Hard' }]} /></div>
        <div><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Type</p><Seg value={kind} onChange={setKind} options={[{ v: 'mcq', label: 'MCQ' }, { v: 'tf', label: 'True / False' }, { v: 'mixed', label: 'Mixed' }]} /></div>
        <div><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Language</p><Seg value={language} onChange={setLanguage} options={[{ v: 'Auto', label: 'Auto' }, { v: 'English', label: 'English' }, { v: 'Urdu', label: 'اردو' }, { v: 'Roman Urdu', label: 'Roman Urdu' }]} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary !px-5 !py-2.5" disabled={busy || topic.trim().length < 3} onClick={go}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{busy ? 'Writing questions…' : 'Create quiz'}
        </button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" />Made with free AI models – costs no credits</span>
      </div>
    </div>
  );
}
