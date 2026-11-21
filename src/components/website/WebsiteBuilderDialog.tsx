'use client';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, ArrowLeft, ArrowRight, Loader2, Download, Globe, Check, Code2,
  Sparkles, FileArchive, ClipboardCheck,
} from 'lucide-react';
import { zipSync, strToU8 } from 'fflate';
import type { PickerModel } from '@/components/chat/ModelPicker';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

type WebsiteProject = {
  projectName: string;
  summary: string;
  files: { path: string; content: string }[];
  nextSteps: string[];
};
type WebsiteResponse = { project: WebsiteProject; model: string; creditsCharged: number; createdAt: string };

const PAGE_OPTIONS = ['Home', 'About', 'Services', 'Products', 'Pricing', 'Portfolio', 'Gallery', 'Blog', 'FAQ', 'Contact'];
const FEATURE_OPTIONS = ['Contact form', 'WhatsApp call-to-action', 'Product search', 'Shopping cart UI', 'Testimonials', 'FAQ accordion', 'Newsletter signup', 'Dashboard UI', 'Booking form', 'Search and filters'];
const CODE_FAMILIES = /deepseek|qwen|yi-|glm|zhipu|kimi|moonshot|minimax|stepfun|internlm|baichuan|doubao|hunyuan/i;

export function WebsiteBuilderDialog({ open, onClose, models, preferredModel }: {
  open: boolean; onClose: () => void; models: PickerModel[]; preferredModel?: string;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WebsiteResponse | null>(null);
  const [fileFilter, setFileFilter] = useState('');
  const [form, setForm] = useState({
    websiteName: '', idea: '', industry: '', audience: '', goal: '',
    pages: ['Home', 'About', 'Services', 'Contact'],
    style: 'Modern and minimal', primaryColor: '#111827', accentColor: '#22c55e',
    language: 'English', tone: 'Professional and friendly',
    features: ['Contact form', 'WhatsApp call-to-action', 'Testimonials', 'FAQ accordion'],
    contentDetails: '', referenceSite: '', contactDetails: '',
  });

  const candidates = useMemo(() => models.filter((model) =>
    !model.locked && model.id !== 'auto' && model.outputModalities?.includes('text')
  ), [models]);
  const chinese = useMemo(() => candidates.filter((model) => CODE_FAMILIES.test(model.id + ' ' + model.name)), [candidates]);
  const available = chinese.length ? chinese : candidates;
  const [modelId, setModelId] = useState('');

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const toggleChoice = (key: 'pages' | 'features', value: string) =>
    setForm((old) => ({
      ...old,
      [key]: old[key].includes(value) ? old[key].filter((item) => item !== value) : [...old[key], value],
    }));

  function startOver() {
    setStep(0); setResult(null); setBusy(false); setFileFilter('');
  }

  async function generate() {
    if (!form.websiteName.trim() || form.idea.trim().length < 20 || !form.pages.length || !modelId) {
      toast('Complete the required details and choose a code model.', 'info');
      return;
    }
    setBusy(true);
    try {
      const response = await api<WebsiteResponse>('/api/generate/website', 'POST', {
        requestId: crypto.randomUUID(),
        model: modelId,
        ...form,
      });
      setResult(response);
      setStep(4);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Website generation failed', 'err');
    } finally {
      setBusy(false);
    }
  }

  function downloadZip() {
    if (!result) return;
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const file of result.project.files) entries[file.path] = strToU8(file.content);
      const zipped = zipSync(entries, { level: 6 });
      const bytes = new Uint8Array(zipped.length);
      bytes.set(zipped);
      const blob = new Blob([bytes.buffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = (result.project.projectName || 'website').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Could not package the website files into a ZIP.', 'err');
    }
  }

  const validStep = step === 0
    ? form.websiteName.trim().length >= 2 && form.idea.trim().length >= 20 && form.industry.trim().length >= 2 && form.audience.trim().length >= 2 && form.goal.trim().length >= 2
    : step === 1 ? form.pages.length > 0
    : step === 2 ? form.style.length > 1 && form.language.length > 1
    : true;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-2 backdrop-blur-sm sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div onMouseDown={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18 }} transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Globe className="h-5 w-5" /></span>
                <div className="min-w-0"><h2 className="font-bold">Build a Website</h2><p className="text-xs text-muted-foreground">Guided brief → complete code → ZIP download</p></div>
              </div>
              <button type="button" onClick={onClose} className="btn-ghost h-8 w-8 !p-0" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            {!result && (
              <div className="border-b border-border px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  {['Website brief', 'Pages', 'Design', 'Code model'].map((label, index) => (
                    <div key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className={'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ' + (step === index ? 'bg-primary text-primary-foreground' : step > index ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                        {step > index ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className={'hidden truncate text-[11px] font-medium sm:block ' + (step === index ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {!result && step === 0 && (
                <div className="space-y-4">
                  <div><h3 className="text-lg font-semibold">Tell us what you want to build</h3><p className="mt-1 text-sm text-muted-foreground">More detail now means a more complete first version.</p></div>
                  <label className="block text-sm font-medium">Website or brand name<input className="input mt-1.5" value={form.websiteName} onChange={(e) => setField('websiteName', e.target.value)} placeholder="e.g. Ilm AI Studio" maxLength={100} /></label>
                  <label className="block text-sm font-medium">Describe the website in detail
                    <textarea className="input mt-1.5 min-h-28" value={form.idea} onChange={(e) => setField('idea', e.target.value)} placeholder="What does the business do? What should visitors see, understand and be able to do? Include important sections, products, services and any reference ideas." maxLength={3000} />
                    <span className="mt-1 block text-right text-[10px] text-muted-foreground">{form.idea.length}/3000 · at least 20 characters</span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium">Industry<input className="input mt-1.5" value={form.industry} onChange={(e) => setField('industry', e.target.value)} placeholder="Education, retail, SaaS…" /></label>
                    <label className="text-sm font-medium">Target audience<input className="input mt-1.5" value={form.audience} onChange={(e) => setField('audience', e.target.value)} placeholder="Who will visit the website?" /></label>
                  </div>
                  <label className="block text-sm font-medium">Main goal<input className="input mt-1.5" value={form.goal} onChange={(e) => setField('goal', e.target.value)} placeholder="Sales, leads, bookings, portfolio…" /></label>
                </div>
              )}

              {!result && step === 1 && (
                <div className="space-y-4">
                  <div><h3 className="text-lg font-semibold">Which pages do you need?</h3><p className="mt-1 text-sm text-muted-foreground">Select every page the website should include.</p></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PAGE_OPTIONS.map((page) => (
                      <label key={page} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted">
                        <input type="checkbox" checked={form.pages.includes(page)} onChange={() => toggleChoice('pages', page)} className="accent-primary" />{page}
                      </label>
                    ))}
                  </div>
                  <label className="block text-sm font-medium">Specific page names or structure<textarea className="input mt-1.5 min-h-20" value={fileFilter} onChange={(e) => setFileFilter(e.target.value)} placeholder="Optional: add custom pages, sub-pages or section order." /></label>
                </div>
              )}

              {!result && step === 2 && (
                <div className="space-y-4">
                  <div><h3 className="text-lg font-semibold">Visual style and content</h3><p className="mt-1 text-sm text-muted-foreground">Choose an overall style. The code model will build the full responsive UI.</p></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {['Modern and minimal', 'Premium and luxurious', 'Corporate and professional', 'Bold and creative', 'Friendly and playful', 'Editorial and elegant'].map((style) => (
                      <button type="button" key={style} onClick={() => setField('style', style)} className={'rounded-xl border px-3 py-2.5 text-left text-sm ' + (form.style === style ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:bg-muted')}>{style}</button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">Primary colour<input type="color" value={form.primaryColor} onChange={(e) => setField('primaryColor', e.target.value)} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" /></label>
                    <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">Accent colour<input type="color" value={form.accentColor} onChange={(e) => setField('accentColor', e.target.value)} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" /></label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium">Language<select className="input mt-1.5" value={form.language} onChange={(e) => setField('language', e.target.value)}>{['English', 'Urdu', 'Roman Urdu', 'Arabic', 'Bilingual (English + Urdu)'].map((v) => <option key={v}>{v}</option>)}</select></label>
                    <label className="text-sm font-medium">Writing tone<select className="input mt-1.5" value={form.tone} onChange={(e) => setField('tone', e.target.value)}>{['Professional and friendly', 'Premium and confident', 'Simple and conversational', 'Energetic and persuasive', 'Formal and authoritative'].map((v) => <option key={v}>{v}</option>)}</select></label>
                  </div>
                  <div><p className="mb-2 text-sm font-medium">Features to include</p><div className="grid gap-2 sm:grid-cols-2">{FEATURE_OPTIONS.map((feature) => <label key={feature} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><input type="checkbox" checked={form.features.includes(feature)} onChange={() => toggleChoice('features', feature)} className="accent-primary" />{feature}</label>)}</div></div>
                  <label className="block text-sm font-medium">Exact copy, products, prices, FAQs or special requirements<textarea className="input mt-1.5 min-h-24" value={form.contentDetails} onChange={(e) => setField('contentDetails', e.target.value)} placeholder="Provide exact text, services, descriptions, price lists, FAQs, addresses, operating hours, disclaimers and any required wording." maxLength={3000} /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium">Reference website (optional)<input className="input mt-1.5" value={form.referenceSite} onChange={(e) => setField('referenceSite', e.target.value)} placeholder="https://example.com" maxLength={500} /></label>
                    <label className="text-sm font-medium">Contact details (optional)<input className="input mt-1.5" value={form.contactDetails} onChange={(e) => setField('contactDetails', e.target.value)} placeholder="Email, phone, address…" maxLength={1000} /></label>
                  </div>
                </div>
              )}

              {!result && step === 3 && (
                <div className="space-y-4">
                  <div><h3 className="text-lg font-semibold">Choose your website code model</h3><p className="mt-1 text-sm text-muted-foreground">DeepSeek and Qwen code models are prioritised where available. The model you select will write the project files.</p></div>
                  {chinese.length === 0 && <p className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">No unlocked DeepSeek/Qwen-family model was found in the current catalogue. Choose any available text/code model below.</p>}
                  <label className="block text-sm font-medium">Code model<select className="input mt-1.5" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                    <option value="">Choose a model…</option>
                    {available.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}{model.isFree ? ' · Free' : ''}</option>)}
                  </select></label>
                  <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <p className="mb-1 font-semibold text-foreground">Generation brief summary</p>
                    <p>{form.websiteName} · {form.industry} · {form.pages.length} pages · {form.features.length} selected features</p>
                    <p className="mt-1">Visual style: {form.style} · Language: {form.language}</p>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                    <p className="mb-1 flex items-center gap-2 font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" />What will be included</p>
                    Complete source files, Next.js setup, README, launch checklist and suggested next steps. Project code will be validated before it is packaged.
                  </div>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Check className="h-4 w-4" />Project generated</p>
                    <h3 className="mt-2 text-xl font-bold">{result.project.projectName}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{result.project.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{result.project.files.length} files · Model: {result.model} · {result.creditsCharged} credits</p>
                  </div>
                  <button type="button" onClick={downloadZip} className="btn-primary flex h-12 w-full justify-center"><Download className="h-4 w-4" />Download complete website ZIP</button>
                  <div className="rounded-xl border border-border p-3">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileArchive className="h-4 w-4 text-primary" />Generated files</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-muted-foreground">
                      {result.project.files.map((file) => <p key={file.path} className="truncate">{file.path}</p>)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-primary" />Next steps</p>
                    <ol className="list-inside list-decimal space-y-1.5 text-xs text-muted-foreground">{result.project.nextSteps.map((item, index) => <li key={index}>{item}</li>)}</ol>
                  </div>
                  <p className="text-[11px] text-muted-foreground">The generated code has passed structural and path checks. Run its build and test the forms, links, integrations and responsive layout before publishing.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
              {!result ? (
                <>
                  <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || busy} className="btn-outline"><ArrowLeft className="h-4 w-4" />Back</button>
                  {step < 3 ? (
                    <button type="button" onClick={() => setStep((current) => current + 1)} disabled={!validStep} className="btn-primary">Continue<ArrowRight className="h-4 w-4" /></button>
                  ) : (
                    <button type="button" onClick={generate} disabled={busy || !modelId} className="btn-primary">
                      {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Building files…</> : <><Code2 className="h-4 w-4" />Generate Website</>}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" onClick={startOver} className="btn-outline">Build another</button>
                  <button type="button" onClick={onClose} className="btn-primary">Done</button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
