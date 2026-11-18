'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Wand2, Download } from 'lucide-react';
import { useApp } from '@/components/chat/AppShell';
import { useToast } from '@/components/providers';

/** Working image generator: prompt → /api/generate/image → B2 → signed URL. */
export function ImageTool() {
  const { refreshMe } = useApp();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<{ id: string; url: string }[]>([]);

  async function go() {
    if (prompt.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/generate/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Failed');
      setImages((x) => [...j.assets, ...x]);
      refreshMe();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-3">
        <textarea dir="auto" rows={3} className="w-full resize-none bg-transparent p-3 outline-none placeholder:text-muted-foreground/70" placeholder="Describe the image you want… e.g. a watercolor mosque at sunrise, soft green tones"
          value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="flex justify-end"><button className="btn-primary" disabled={busy || prompt.trim().length < 3} onClick={go}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Generate</button></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {busy && <div className="card aspect-square animate-pulse bg-muted" />}
        {images.map((im, i) => (
          <motion.div key={im.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} className="card group relative overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt={prompt} className="aspect-square w-full object-cover" />
            <a href={im.url} target="_blank" rel="noreferrer" className="btn-primary absolute bottom-3 right-3 !px-3 !py-1.5 opacity-0 transition group-hover:opacity-100"><Download className="h-4 w-4" /></a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
