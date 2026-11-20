'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LogoMark } from '@/components/ui/Logo';
import { iconFor } from '@/components/icons';
import type { Mode } from '@/lib/modes';
import type { Audience } from '@/components/chat/AppShell';

const GENERIC: Record<Audience, string[]> = {
  student: ['Explain photosynthesis in simple words', 'Solve 2x + 5 = 17 step by step', 'Write a polite leave application for school', 'Ek chhoti akhlaqi kahani Urdu mein likho'],
  teacher: ['Plan a 40-minute lesson on the water cycle for Class 5', 'Make a 10-question MCQ quiz on Newton\'s laws', 'Write a note to parents about low attendance', 'Low-cost science experiments for Class 6'],
};

/** What the user sees before the first message: a mode intro (+ quiz builder) or a friendly start screen. */
export function EmptyState({ mode, modes, audience, onSend, quizSlot }: {
  mode: Mode | null; modes: Mode[]; audience: Audience; onSend: (t: string) => void; quizSlot?: React.ReactNode;
}) {
  const Icon = mode ? iconFor(mode.icon) : null;
  const starters = mode ? mode.starters : GENERIC[audience];
  const quick = modes.filter((m) => m.audience === 'both' || m.audience === audience).slice(0, 4);

  return (
    <div className="m-auto w-full py-8 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', damping: 14 }} className="mx-auto mb-5 w-fit">
        {Icon ? <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow"><Icon className="h-8 w-8" /></span> : <LogoMark className="h-16 w-16 drop-shadow-lg" />}
      </motion.div>

      {mode ? (
        <>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{mode.name}</h2>
          {mode.name_ur && <p className="font-urdu mt-1 text-lg text-primary" dir="rtl">{mode.name_ur}</p>}
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">{mode.description}</p>
        </>
      ) : (
        <>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{audience === 'teacher' ? 'What are we ' : 'What will you '}<span className="text-gradient">{audience === 'teacher' ? 'teaching' : 'learn'}</span> today?</h2>
          <p className="font-urdu mt-2 text-muted-foreground" dir="rtl">{audience === 'teacher' ? 'آج کیا پڑھانا ہے؟' : 'آج آپ کیا سیکھنا چاہیں گے؟'}</p>
        </>
      )}

      {quizSlot && <div className="card mx-auto mt-7 max-w-2xl p-5 text-left shadow-soft">{quizSlot}</div>}

      {starters.length > 0 && (
        <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
          {starters.slice(0, 4).map((t, i) => (
            <motion.button key={t} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.07 }} whileHover={{ y: -3 }}
              onClick={() => onSend(t)} dir="auto" className="card p-4 text-left text-sm font-semibold leading-snug transition hover:border-primary/50 hover:shadow-glow">{t}</motion.button>
          ))}
        </div>
      )}

      {!mode && quick.length > 0 && (
        <div className="mx-auto mt-8 max-w-3xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{audience === 'teacher' ? 'Teacher' : 'Student'} modes</p>
          <div className="flex flex-wrap justify-center gap-2">
            {quick.map((m) => { const I = iconFor(m.icon); return (
              <Link key={m.id} href={`/chat?mode=${m.slug}`} className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:border-primary/60 hover:bg-accent"><I className="h-4 w-4 text-primary" />{m.name}</Link>
            ); })}
          </div>
        </div>
      )}
    </div>
  );
}
