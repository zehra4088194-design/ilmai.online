'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, ArrowUpRight } from 'lucide-react';

const STARTERS = [
  'Explain a complex topic in simple terms',
  'Summarize a document or PDF',
  'Write, edit, or improve some text',
  'Help me solve a problem step by step',
];

/** A compact, neutral starting point for the universal chat. */
export function EmptyState({ onSend, showUpgrade=false }: { onSend: (text: string) => void; showUpgrade?:boolean }) {
  return (
    <div className="mx-auto mt-8 w-full max-w-3xl px-2 text-center sm:mt-10">
      {showUpgrade&&<motion.div initial={{opacity:0,y:8,scale:0.96}} animate={{opacity:1,y:0,scale:1}} className="mb-5 flex justify-center">
        <Link href="/plans" className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary shadow-sm transition hover:border-primary/60 hover:bg-primary/15">
          <Sparkles className="h-3.5 w-3.5"/>
          Upgrade your plan
          <span className="text-primary/70">·</span>
          <span className="text-foreground/80">Unlock more AI</span>
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/>
        </Link>
      </motion.div>}
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
