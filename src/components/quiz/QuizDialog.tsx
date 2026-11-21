'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CircleHelp } from 'lucide-react';
import { QuizBuilder, type QuizCreated } from '@/components/quiz/QuizBuilder';

export function QuizDialog({ open, onClose, ...builder }: {
  open: boolean; onClose: () => void; conversationId?: string | null; mode?: string | null; defaultTopic?: string; context?: string; onCreated: (r: QuizCreated) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass w-full max-w-xl rounded-3xl bg-card p-6 shadow-glow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary"><CircleHelp className="h-5 w-5" /></span>Create a quiz</h2>
              <button className="btn-ghost h-8 w-8 !p-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <QuizBuilder {...builder} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
