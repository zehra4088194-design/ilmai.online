'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Presentation } from 'lucide-react';
import { useApp } from '@/components/chat/AppShell';
import { useToast } from '@/components/providers';

type Slide = { type: string; title: string; bullets?: string[]; left?: string[]; right?: string[]; quote?: string };

/** Step 1 of presentations: topic → slide outline (JSON). PPTX/PDF export is the next milestone (see docs/ROADMAP.md). */
export function PresentationTool() {
  const { refreshMe } = useApp();
  const toast = useToast();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState<{ title: string; slides: Slide[] } | null>(null);

  async function go() {
    if (topic.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/generate/presentation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, slides: count }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Failed');
      setDeck(j.deck);
      refreshMe();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="glass space-y-3 rounded-3xl p-4">
        <input dir="auto" className="input" placeholder="Presentation topic, e.g. The Water Cycle for class 6" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Slides</label>
          <input type="range" min={3} max={20} value={count} onChange={(e) => setCount(+e.target.value)} className="flex-1 accent-[hsl(var(--primary))]" />
          <span className="w-6 text-sm font-bold">{count}</span>
          <button className="btn-primary" disabled={busy || topic.trim().length < 3} onClick={go}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}Create outline</button>
        </div>
      </div>
      {deck && (
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold">{deck.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {deck.slides.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card aspect-video overflow-hidden p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{i + 1} · {s.type.replace('_', ' ')}</p>
                <p className="mt-1 font-bold leading-tight">{s.title}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {(s.bullets ?? [...(s.left ?? []), ...(s.right ?? [])]).slice(0, 4).map((b, j) => <li key={j} className="truncate">• {b}</li>)}
                  {s.quote && <li className="italic">“{s.quote}”</li>}
                </ul>
              </motion.div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">PPTX / PDF export is the next milestone – the outline above is the validated JSON the exporter will consume.</p>
        </div>
      )}
    </div>
  );
}
