'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImagePlus, Loader2, Download, Sparkles, RefreshCw } from 'lucide-react';
import { useApp } from '@/components/chat/AppShell';
import { useToast } from '@/components/providers';
import { api } from '@/lib/client-api';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import type { Attachment } from '@/lib/attachment-validation';

type ParameterCatalog = string[];
type ImageModel = { id: string; name: string; description: string; parameters: ParameterCatalog; inputModalities: string[]; parameterOptions?: { aspect_ratio?: string[]; resolution?: string[]; quality?: string[]; output_format?: string[]; n?: string[] }; parameterRanges?: { n?: { min: number; max: number; step: number } | null } };
type GeneratedAsset = { id: string; kind: string; mime: string; sizeBytes: number; createdAt: string; url: string };
type Template = { id: string; label: string; description: string; prompt: string };

const BUILT_IN_TEMPLATES: Template[] = [
  { id: 'classroom-illustration', label: 'Classroom illustration', description: 'Friendly educational artwork', prompt: 'Create a clean, friendly educational illustration for a classroom learning resource. Clear subject, simple composition, no text or watermark.' },
  { id: 'science-diagram', label: 'Science concept', description: 'A clear visual explanation', prompt: 'Create a scientifically accurate educational visual. Use a clear central subject, distinct visual parts, and a neat uncluttered composition. Do not add labels or words.' },
  { id: 'storybook', label: 'Storybook scene', description: 'Warm, child-friendly visual', prompt: 'Create a warm, imaginative storybook illustration with expressive characters, balanced composition, gentle lighting and age-appropriate detail.' },
  { id: 'poster-background', label: 'Poster background', description: 'A polished background without wording', prompt: 'Create a polished poster background with a clear focal area, generous empty space for later typography, high contrast and no lettering or watermark.' },
];

const ASPECT_RATIOS = ['1:1','3:2','2:3','4:3','3:4','16:9','9:16','5:4','4:5'];
const RESOLUTIONS = ['1K','2K','4K'];
const QUALITIES = ['low','medium','high'];
const FORMATS = ['png','jpeg','webp'] as const;

export function ImageTool() {
  const { refreshMe } = useApp();
  const toast = useToast();
  const [models, setModels] = useState<ImageModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('');
  const [resolution, setResolution] = useState('');
  const [quality, setQuality] = useState('');
  const [outputFormat, setOutputFormat] = useState<(typeof FORMATS)[number]>('png');
  const [count, setCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [templates, setTemplates] = useState<Template[]>(BUILT_IN_TEMPLATES);
  const [error, setError] = useState('');

  const selectedModel = useMemo(() => models.find((model) => model.id === modelId) ?? null, [models, modelId]);
  const supports = (key: string) => key === 'imageUrls'
    ? !!selectedModel?.inputModalities.includes('image')
    : !!selectedModel?.parameters.includes(key);

  const loadModels = useCallback(async () => {
    setLoadingModels(true); setError('');
    try {
      const [data,creativeData] = await Promise.all([
        api<{ models: ImageModel[] }>('/api/models/images', 'GET'),
        api<{ creatives: {id:string;title:string;altText:string;templatePrompt:string;url:string}[] }>('/api/creatives?location=image_template','GET').catch(()=>({creatives:[]})),
      ]);
      setModels(data.models ?? []);
      setTemplates([
        ...BUILT_IN_TEMPLATES,
        ...creativeData.creatives.map((item)=>({
          id:item.id,label:item.title||'Custom template',
          description:item.altText||'Admin-provided image template',
          prompt:item.templatePrompt,
        })),
      ]);
      setModelId((current) => current && data.models.some((item) => item.id === current) ? current : data.models[0]?.id ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load image models');
    } finally { setLoadingModels(false); }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  useEffect(() => {
    if (!selectedModel) return;
    const options = selectedModel?.parameterOptions;
    if (!supports('aspect_ratio')) setAspectRatio('');
    else setAspectRatio((current) => options?.aspect_ratio?.length && current && !options.aspect_ratio.includes(current) ? '' : current);
    if (!supports('resolution')) setResolution('');
    else setResolution((current) => options?.resolution?.length && current && !options.resolution.includes(current) ? '' : current);
    if (!supports('quality')) setQuality('');
    else setQuality((current) => options?.quality?.length && current && !options.quality.includes(current) ? '' : current);
    if (!supports('output_format')) setOutputFormat('png');
    else setOutputFormat((current) => options?.output_format?.length && !options.output_format.includes(current) ? options.output_format[0] as typeof outputFormat : current);
    if (!supports('n')) setCount(1);
    else setCount((current) => options?.n?.length && !options.n.includes(String(current)) ? Number(options.n[0]) : current);
  }, [modelId, selectedModel]);

  function applyTemplate(template: Template) {
    setPrompt((current) => current.trim() ? current.trim() + '\n\n' + template.prompt : template.prompt);
  }

  async function generate() {
    if (busy || uploading || prompt.trim().length < 3 || !modelId) return;
    setBusy(true); setAction('Generating image'); setError('');
    try {
      const nativeNegativePrompt = supports('negative_prompt');
      const finalPrompt = negativePrompt.trim() && !nativeNegativePrompt
        ? prompt.trim() + '\n\nAvoid these visual elements: ' + negativePrompt.trim()
        : prompt.trim();
      const data = await api<{ assets: GeneratedAsset[]; creditsCharged: number }>('/api/generate/image', 'POST', {
        requestId: crypto.randomUUID(),
        prompt: finalPrompt,
        negativePrompt: nativeNegativePrompt ? negativePrompt.trim() || undefined : undefined,
        model: modelId,
        aspectRatio: aspectRatio || undefined,
        resolution: resolution || undefined,
        quality: quality || undefined,
        outputFormat: supports('output_format') ? outputFormat : undefined,
        count,
        referenceAssetIds: referenceImages.map((item) => item.asset_id).filter((id): id is string => !!id),
      });
      setAssets((current) => [...data.assets, ...current]);
      setReferenceImages([]);
      await refreshMe();
      toast('Generated ' + data.assets.length + ' image' + (data.assets.length === 1 ? '' : 's'), 'ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image generation failed');
    } finally { setBusy(false); setAction(''); }
  }

  return (
    <div className="space-y-6">
      <section className="glass space-y-4 rounded-3xl p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><ImagePlus className="h-5 w-5" /></div>
          <div><h2 className="text-xl font-extrabold">Image Studio</h2><p className="mt-1 text-sm text-muted-foreground">Create illustrations, concept art, classroom posters and custom visual assets.</p></div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Start with a template</p>
          <button className="btn-ghost text-xs" disabled={loadingModels || busy} onClick={loadModels}><RefreshCw className="h-3.5 w-3.5" /> Refresh model catalog</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((template) => (
            <button key={template.id} type="button" className="rounded-2xl border border-border p-3 text-left transition hover:bg-muted/60" disabled={busy} onClick={() => applyTemplate(template)}>
              <span className="block text-sm font-bold">{template.label}</span><span className="mt-1 block text-xs text-muted-foreground">{template.description}</span>
            </button>
          ))}
        </div>

        <label className="block space-y-1 text-sm font-medium">Describe your image
          <textarea className="input min-h-24" dir="auto" maxLength={6000} placeholder="Describe the subject, style, setting, lighting, composition and intended use…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm font-medium">Things to avoid (optional)
          <textarea className="input min-h-16" dir="auto" maxLength={1200} placeholder="e.g. blurry details, extra fingers, watermarks, text, cluttered background" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} />
          <span className="block text-[11px] font-normal text-muted-foreground">This is added as an instruction to the prompt. A dedicated negative-prompt parameter is used only by models that expose it.</span>
        </label>
        {supports('imageUrls') && <div className="space-y-2">
          <p className="text-sm font-medium">Reference images (optional)</p>
          <AttachmentPicker value={referenceImages} onChange={(items) => setReferenceImages(items.slice(0, 4))} disabled={busy} onUploadingChange={setUploading} />
          <p className="text-[11px] text-muted-foreground">This model accepts reference images for image-to-image editing or visual guidance.</p>
        </div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Image model
            <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={loadingModels || !models.length || busy}>
              {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Number of images
            <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy || !supports('n')}>
              {(selectedModel?.parameterOptions?.n?.length ? selectedModel.parameterOptions.n.map(Number) : [1,2,3,4]).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!supports('n') && <span className="block text-[11px] font-normal text-muted-foreground">This model returns one image per request.</span>}
          </label>
          {supports('aspect_ratio') && <label className="space-y-1 text-sm font-medium">Aspect ratio
            <select className="input" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}><option value="">Model default</option>{(selectedModel?.parameterOptions?.aspect_ratio?.length ? selectedModel.parameterOptions.aspect_ratio : ASPECT_RATIOS).map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</select>
          </label>}
          {supports('resolution') && <label className="space-y-1 text-sm font-medium">Resolution
            <select className="input" value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="">Model default</option>{(selectedModel?.parameterOptions?.resolution?.length ? selectedModel.parameterOptions.resolution : RESOLUTIONS).map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </label>}
          {supports('quality') && <label className="space-y-1 text-sm font-medium">Quality
            <select className="input" value={quality} onChange={(e) => setQuality(e.target.value)}><option value="">Model default</option>{(selectedModel?.parameterOptions?.quality?.length ? selectedModel.parameterOptions.quality : QUALITIES).map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </label>}
          {supports('output_format') && <label className="space-y-1 text-sm font-medium">File format
            <select className="input" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as typeof outputFormat)}>{(selectedModel?.parameterOptions?.output_format?.length ? selectedModel.parameterOptions.output_format : FORMATS).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select>
          </label>}
        </div>
        {selectedModel && <p className="text-xs text-muted-foreground">{selectedModel.description || selectedModel.id} · {selectedModel.parameters.length} reported options detected from the live model catalog.</p>}
        <button className="btn-primary w-full !py-3 sm:w-auto" disabled={busy || uploading || loadingModels || !modelId || prompt.trim().length < 3} onClick={generate}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? action || 'Working…' : 'Generate image'}
        </button>
      </section>

      {loadingModels && <div className="card p-5 text-sm text-muted-foreground">Loading the current image-model catalog…</div>}
      {!loadingModels && !models.length && <div className="card p-5 text-sm text-muted-foreground">No image models are currently available to your account.</div>}
      {assets.length > 0 && (
        <section className="space-y-3">
          <div><h3 className="text-lg font-extrabold">Generated images</h3><p className="text-xs text-muted-foreground">Saved to your private Library.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <article key={asset.id} className="card overflow-hidden">
                <a href={asset.url} target="_blank" rel="noopener noreferrer"><img src={asset.url} alt="Generated image" className="aspect-square w-full object-contain bg-muted" loading="lazy" /></a>
                <div className="flex items-center justify-between gap-2 p-3"><span className="text-xs text-muted-foreground">{asset.mime.toUpperCase()} · {(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB</span><a className="btn-outline text-xs" href={asset.url} target="_blank" rel="noopener noreferrer" download><Download className="h-3.5 w-3.5" /> Download</a></div>
              </article>
            ))}
          </div>
        </section>
      )}
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
