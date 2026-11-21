'use client';
import { motion } from 'framer-motion';

const STARTERS = [
  'Explain a complex topic in simple terms',
  'Summarize a document or PDF',
  'Write, edit, or improve some text',
  'Help me solve a problem step by step',
];

/** A compact, neutral starting point for the universal chat. */
export function EmptyState({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="mx-auto mt-8 w-full max-w-3xl px-2 text-center sm:mt-10">
      <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-semibold tracking-tight sm:text-2xl">
        What can I help you with?
      </motion.h2>
      <p className="mt-1.5 text-sm text-muted-foreground">Ask anything, or start with an example.</p>
      <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {STARTERS.map((text, index) => (
          <motion.button
            key={text}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            onClick={() => onSend(text)}
            className="rounded-xl border border-border bg-card px-4 py-3 text-left text-[13px] font-medium leading-snug text-foreground transition hover:border-primary/60 hover:bg-muted"
          >
            {text}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
