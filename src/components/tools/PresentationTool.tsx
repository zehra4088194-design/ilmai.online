'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, Presentation, Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/components/chat/AppShell';
import { useToast } from '@/components/providers';
import type { PresentationDeck, PresentationSlide } from '@/lib/presentation-schema';

type Format = 'pptx' | 'pdf';
type Theme = 'emerald' | 'midnight' | 'sand';
type PresentationModel = { id: string; name: string; provider?: string; locked?: boolean };

const innerTypes = ['bullets','two_column','quote'] as const;
const emptySlide = (type: PresentationSlide['type'] = 'bullets'): PresentationSlide => ({
  type, title: type === 'quote' ? 'A thought to remember' : 'New slide',
  bullets: type === 'bullets' ? ['Add your first point'] : [],
  left: type === 'two_column' ? ['First idea'] : [],
  right: type === 'two_column' ? ['Second idea'] : [],
  quote: type === 'quote' ? 'Add a short memorable quote' : '',
  notes: '',
});

export function PresentationTool() {
  const { refreshMe, features } = useApp();
  const toast = useToast();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(8);
  const [language, setLanguage] = useState<'English'|'Urdu'|'Roman Urdu'>('English');
  const [theme, setTheme] = useState<Theme>('emerald');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [deck, setDeck] = useState<PresentationDeck | null>(null);
  const [lastDownload, setLastDownload] = useState<string | null>(null);
  const [models, setModels] = useState<PresentationModel[]>([]);
  const [model, setModel] = useState('auto');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled && Array.isArray(data?.models)) { const available = data.models.filter((item: PresentationModel) => /claude|anthropic/i.test(item.id + ' ' + item.name)); setModels(available); if (available.some((item: PresentationModel) => !item.locked)) setModel((current) => current === 'auto' ? 'claude-auto' : current); } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const presentationFeature = features.find((feature) => feature.key === 'presentations');
  const pdfEnabled = presentationFeature?.config?.pdf_export !== false;
  const slides = deck?.slides ?? [];

  const canMove = useMemo(() => slides.map((_, index) => index > 0 && index < slides.length - 1), [slides.length]);

  async function generate() {
    if (topic.trim().length < 3 || busy) return;
    const selectedClaude = model === 'claude-auto' ? models.find((item) => !item.locked) : models.find((item) => item.id === model && !item.locked);
    if (model !== 'auto' && !selectedClaude) { toast('Claude is not enabled or available for your account. Choose Auto or ask admin to enable a Claude model.', 'err'); return; }
    setBusy(true); setAction('Building complete presentation'); setLastDownload(null);
    try {
      const response = await fetch('/api/generate/presentation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), topic, slides: count, language, ...(model === 'auto' ? {} : { model: selectedClaude?.id }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not create the presentation');
      setDeck(data.deck);
      await refreshMe();
      toast('Full presentation created', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create the presentation', 'err');
    } finally { setBusy(false); setAction(''); }
  }

  function updateDeckTitle(title: string) {
    setDeck((current) => current ? { ...current, title } : current);
  }

  function updateSlide(index: number, patch: Partial<PresentationSlide>) {
    setDeck((current) => current ? {
      ...current,
      slides: current.slides.map((slide, i) => i === index ? { ...slide, ...patch } : slide),
    } : current);
  }

  function moveSlide(index: number, direction: -1 | 1) {
    setDeck((current) => {
      if (!current || index === 0 || index === current.slides.length - 1) return current;
      const target = index + direction;
      if (target <= 0 || target >= current.slides.length - 1) return current;
      const next = [...current.slides];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return { ...current, slides: next };
    });
  }

  function addSlide(type: typeof innerTypes[number] = 'bullets') {
    setDeck((current) => current ? {
      ...current,
      slides: [...current.slides.slice(0, -1), emptySlide(type), current.slides[current.slides.length - 1]],
    } : current);
  }

  function removeSlide(index: number) {
    setDeck((current) => current && current.slides.length > 3 && index > 0 && index < current.slides.length - 1
      ? { ...current, slides: current.slides.filter((_, i) => i !== index) } : current);
  }

  async function exportDeck(format: Format) {
    if (!deck || busy) return;
    setBusy(true); setAction('Preparing ' + format.toUpperCase());
    try {
      const response = await fetch('/api/generate/presentation/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, language, theme, deck }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || data?.message || 'Export failed. Please try again.');
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('The exported file is empty.');
      const fallbackName = (deck.title || 'ilmai-presentation').replace(/[\\/:*?"<>|]+/g, '-').trim();
      const disposition = response.headers.get('content-disposition') || '';
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = match?.[1] || fallbackName + (format === 'pptx' ? '.pptx' : '.pdf');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 15000);
      setLastDownload(format.toUpperCase());
      toast(format.toUpperCase() + ' downloaded', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed', 'err');
    } finally { setBusy(false); setAction(''); }
  }

  return (
    <div className="space-y-6">
      <section className="glass space-y-4 rounded-3xl p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Presentation className="h-5 w-5" /></div>
          <div><h2 className="text-xl font-extrabold">Presentation Studio</h2><p className="mt-1 text-sm text-muted-foreground">Create, edit and export teaching slides in English or Urdu.</p></div>
        </div>
        <label className="block space-y-1 text-sm font-medium">Topic / learning objective
          <textarea dir="auto" className="input min-h-20" maxLength={2000} placeholder="e.g. The water cycle for Class 6, with a simple explanation and a short recap" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm font-medium">Number of slides
            <input className="input" type="number" min={3} max={20} value={count} onChange={(e) => setCount(Math.max(3, Math.min(20, Number(e.target.value) || 3)))} />
          </label>
          <label className="space-y-1 text-sm font-medium">Language
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}><option>English</option><option>Urdu</option><option>Roman Urdu</option></select>
          </label>
          <label className="space-y-1 text-sm font-medium">AI model
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="claude-auto">Claude · best available</option>
              <option value="auto">Auto · choose a model</option>
              {models.filter((item) => !item.locked).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Design theme
            <select className="input" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="emerald">Emerald</option><option value="midnight">Midnight</option><option value="sand">Sand</option></select>
          </label>
        </div>
        {models.length === 0 && <p className="text-xs text-muted-foreground">Claude models are not currently listed as enabled. Auto can still create the deck; an admin can enable Claude in Model Settings.</p>}
        {models.length > 0 && models.every((item) => item.locked) && <p className="text-xs text-muted-foreground">Claude models are listed but unavailable on this plan. Ask an admin to enable plan access.</p>}
        <button className="btn-primary" disabled={busy || topic.trim().length < 3} onClick={generate}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />} {busy ? action || 'Working…' : 'Create presentation'}
        </button>
      </section>

      {deck && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1"><label className="block text-xs font-semibold text-muted-foreground">Presentation title</label><input className="input mt-1 font-bold" value={deck.title} maxLength={600} onChange={(e) => updateDeckTitle(e.target.value)} /></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline text-xs" disabled={busy} onClick={() => exportDeck('pptx')}><Download className="h-4 w-4" /> Export PPTX</button>
              <button className="btn-primary text-xs" disabled={busy || !pdfEnabled} onClick={() => exportDeck('pdf')} title={!pdfEnabled ? 'Enable PDF rendering in the presentation feature settings after deploying the PDF service' : 'Export a 16:9 PDF'}><Download className="h-4 w-4" /> Export PDF</button>
            </div>
          </div>
          {!pdfEnabled && <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">PPTX export is ready. PDF export will be enabled after the private renderer is deployed and the administrator turns on the PDF export setting.</p>}
          {lastDownload && <p role="status" className="text-xs text-muted-foreground">Last export prepared: {lastDownload}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-lg font-extrabold">Edit slides</h3><p className="text-xs text-muted-foreground">The first cover and final closing slide stay in place.</p></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline text-xs" disabled={slides.length >= 20} onClick={() => addSlide('bullets')}><Plus className="h-3.5 w-3.5" /> Bullet slide</button>
              <button className="btn-outline text-xs" disabled={slides.length >= 20} onClick={() => addSlide('two_column')}>Two columns</button>
              <button className="btn-outline text-xs" disabled={slides.length >= 20} onClick={() => addSlide('quote')}>Quote</button>
            </div>
          </div>

          <div className="grid gap-3">
            {slides.map((slide, index) => (
              <motion.article key={index} layout className="glass rounded-3xl p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="badge">{String(index + 1).padStart(2, '0')} · {slide.type.replace('_',' ')}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{slide.notes.length} notes chars</span>
                  <button className="btn-ghost text-xs" disabled={!canMove[index] || index <= 1 || busy} onClick={() => moveSlide(index, -1)}>↑</button>
                  <button className="btn-ghost text-xs" disabled={!canMove[index] || index >= slides.length - 2 || busy} onClick={() => moveSlide(index, 1)}>↓</button>
                  <button className="btn-ghost text-xs text-danger" disabled={index === 0 || index === slides.length - 1 || slides.length <= 3 || busy} onClick={() => removeSlide(index)}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </div>
                {index > 0 && index < slides.length - 1 && (
                  <label className="mb-2 block space-y-1 text-xs font-medium">Slide layout
                    <select className="input" value={slide.type} onChange={(e) => updateSlide(index, { ...emptySlide(e.target.value as typeof innerTypes[number]), title: slide.title, notes: slide.notes })}>
                      {innerTypes.map((type) => <option key={type} value={type}>{type.replace('_',' ')}</option>)}
                    </select>
                  </label>
                )}
                <label className="block space-y-1 text-sm font-medium">Heading<input className="input" maxLength={600} value={slide.title} onChange={(e) => updateSlide(index, { title: e.target.value })} /></label>
                {slide.type === 'title' && <p className="mt-2 text-xs text-muted-foreground">Cover title is taken from the main presentation title.</p>}
                {(slide.type === 'bullets' || slide.type === 'title' || slide.type === 'closing') && (
                  <label className="mt-3 block space-y-1 text-xs font-medium">Points / subtitle<textarea className="input min-h-24" dir="auto" maxLength={6000} value={slide.bullets.join('\n')} onChange={(e) => updateSlide(index, { bullets: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean).slice(0,10) })} /></label>
                )}
                {slide.type === 'two_column' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium">Left column<textarea className="input min-h-32" dir="auto" value={slide.left.join('\n')} onChange={(e) => updateSlide(index, { left: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean).slice(0,10) })} /></label>
                  <label className="space-y-1 text-xs font-medium">Right column<textarea className="input min-h-32" dir="auto" value={slide.right.join('\n')} onChange={(e) => updateSlide(index, { right: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean).slice(0,10) })} /></label>
                </div>}
                {slide.type === 'quote' && <label className="mt-3 block space-y-1 text-xs font-medium">Quote<textarea className="input min-h-24" dir="auto" maxLength={1200} value={slide.quote} onChange={(e) => updateSlide(index, { quote: e.target.value })} /></label>}
                <label className="mt-3 block space-y-1 text-xs font-medium">Speaker notes<textarea className="input min-h-16" dir="auto" maxLength={3000} value={slide.notes} onChange={(e) => updateSlide(index, { notes: e.target.value })} /></label>
              </motion.article>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2"><button className="btn-outline" disabled={busy} onClick={() => exportDeck('pptx')}>Download editable PPTX</button><button className="btn-primary" disabled={busy || !pdfEnabled} onClick={() => exportDeck('pdf')}>Download PDF</button></div>
        </section>
      )}
    </div>
  );
}
