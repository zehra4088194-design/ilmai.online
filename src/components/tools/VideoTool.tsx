'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Film, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useApp } from '@/components/chat/AppShell';
import { useToast } from '@/components/providers';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import type { Attachment } from '@/lib/attachment-validation';

type VideoModel = {
  id:string;name:string;description:string;
  supportedAspectRatios:string[];supportedDurations:number[];supportedResolutions:string[];
  supportedFrameImages:string[];generateAudio:boolean;price:number|null;
};
type VideoTemplate = {id:string;title:string;templatePrompt:string;altText:string;url:string};
type VideoJob = {
  id:string;status:string;model:string;prompt:string;config:Record<string,unknown>;
  error:string|null;creditsCharged:number;createdAt:string;completedAt:string|null;downloadUrl:string|null;
};
const ACTIVE = new Set(['queued','submitted','processing','downloading','storing']);

export function VideoTool() {
  const { refreshMe } = useApp();
  const toast = useToast();
  const [models,setModels] = useState<VideoModel[]>([]);
  const [templates,setTemplates] = useState<VideoTemplate[]>([]);
  const [modelId,setModelId] = useState('auto');
  const [prompt,setPrompt] = useState('');
  const [duration,setDuration] = useState(5);
  const [aspectRatio,setAspectRatio] = useState('16:9');
  const [resolution,setResolution] = useState('');
  const [generateAudio,setGenerateAudio] = useState(true);
  const [frame,setFrame] = useState<Attachment[]>([]);
  const [uploading,setUploading] = useState(false);
  const [jobs,setJobs] = useState<VideoJob[]>([]);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [creditsPerSecond,setCreditsPerSecond] = useState(0);
  const [maxDuration,setMaxDuration] = useState(30);

  const selected = useMemo(() => models.find((model)=>model.id===modelId) ?? null,[models,modelId]);
  const choices = useMemo(() => modelId==='auto'
    ? {
        durations:[...new Set(models.flatMap((model)=>model.supportedDurations))].sort((a,b)=>a-b).filter((n)=>n<=maxDuration),
        ratios:[...new Set(models.flatMap((model)=>model.supportedAspectRatios))],
        resolutions:[...new Set(models.flatMap((model)=>model.supportedResolutions))],
        audio:models.some((model)=>model.generateAudio),
        frame:models.some((model)=>model.supportedFrameImages.includes('first_frame')),
      }
    : {
        durations:selected?.supportedDurations.filter((n)=>n<=maxDuration) ?? [],
        ratios:selected?.supportedAspectRatios ?? [],
        resolutions:selected?.supportedResolutions ?? [],
        audio:!!selected?.generateAudio,
        frame:!!selected?.supportedFrameImages.includes('first_frame'),
      },[modelId,models,selected,maxDuration]);

  const loadJobs = useCallback(async () => {
    const result = await api<{jobs:VideoJob[]}>('/api/generate/video','GET');
    setJobs(result.jobs ?? []);
  },[]);

  const loadModels = useCallback(async () => {
    const [result,creativeData] = await Promise.all([
      api<{models:VideoModel[];creditsPerSecond:number;maxDuration:number;defaultModel:string|null}>('/api/models/videos','GET'),
      api<{creatives:VideoTemplate[]}>('/api/creatives?location=video_template','GET').catch(()=>({creatives:[]})),
    ]);
    setTemplates(creativeData.creatives??[]);
    setModels(result.models);
    setCreditsPerSecond(result.creditsPerSecond);
    setMaxDuration(result.maxDuration);
    const defaultId = result.defaultModel && result.models.some((model)=>model.id===result.defaultModel) ? result.defaultModel : 'auto';
    setModelId((current)=>current==='auto'||result.models.some((model)=>model.id===current)?current:defaultId);
    const first = result.models.find((model)=>model.id===defaultId) ?? result.models[0];
    const allowedDuration = first?.supportedDurations.find((n)=>n<=result.maxDuration) ?? 5;
    setDuration((current)=>first?.supportedDurations.includes(current)&&current<=result.maxDuration?current:allowedDuration);
    setAspectRatio((current)=>first?.supportedAspectRatios.includes(current)?current:first?.supportedAspectRatios[0]??'16:9');
    setResolution((current)=>first?.supportedResolutions.includes(current)?current:first?.supportedResolutions[0]??'');
    setGenerateAudio(!!first?.generateAudio);
  },[]);

  const pollJob = useCallback(async (id:string) => {
    try {
      const result = await api<{job:VideoJob}>('/api/generate/video/'+id,'GET');
      setJobs((current)=>current.map((job)=>job.id===id?result.job:job));
      if(result.job.status==='ready') {
        refreshMe();
        toast('Your video is ready','ok');
      }
    } catch (e) {
      setError(e instanceof Error?e.message:'Could not refresh video status');
    }
  },[refreshMe,toast]);

  useEffect(()=>{
    Promise.all([loadModels(),loadJobs()])
      .catch((e)=>setError(e instanceof Error?e.message:'Could not load Video Studio'))
      .finally(()=>setLoading(false));
  },[loadModels,loadJobs]);

  useEffect(()=>{
    if(!jobs.some((job)=>ACTIVE.has(job.status))) return;
    const timer=setInterval(()=>{
      for(const job of jobs) if(ACTIVE.has(job.status)) void pollJob(job.id);
    },30_000);
    return ()=>clearInterval(timer);
  },[jobs,pollJob]);

  async function generate() {
    if(busy||uploading||prompt.trim().length<3) return;
    setBusy(true);setError('');
    try {
      const result=await api<{job:VideoJob}>('/api/generate/video','POST',{
        requestId:crypto.randomUUID(),
        prompt:prompt.trim(),
        model:modelId,
        duration,
        aspectRatio:aspectRatio||undefined,
        resolution:resolution||undefined,
        generateAudio:choices.audio?generateAudio:undefined,
        firstFrameAssetId:frame[0]?.asset_id,
      });
      setJobs((current)=>[result.job,...current]);
      setFrame([]);
      toast('Video job submitted. It will appear here when ready.','ok');
      void pollJob(result.job.id);
    } catch(e) {
      setError(e instanceof Error?e.message:'Video generation failed');
    } finally {setBusy(false);}
  }

  if(loading) return <div className="card p-8 text-center text-sm text-muted-foreground">Loading video models…</div>;

  return (
    <div className="space-y-6">
      <section className="glass space-y-4 rounded-3xl p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Film className="h-5 w-5"/></div>
          <div><h2 className="text-xl font-extrabold">Video Studio</h2><p className="mt-1 text-sm text-muted-foreground">Create short videos from a prompt or an optional first-frame image. Generation runs in the background.</p></div>
        </div>
        {templates.length>0&&<div className="space-y-2"><p className="text-sm font-semibold">Admin templates</p><div className="grid gap-2 sm:grid-cols-2">{templates.map((template)=><button key={template.id} type="button" className="rounded-xl border border-border p-3 text-left hover:bg-muted" onClick={()=>setPrompt(template.templatePrompt)}><span className="font-semibold">{template.title}</span><span className="block text-xs text-muted-foreground">{template.altText}</span></button>)}</div></div>}
        <label className="block space-y-1 text-sm font-medium">Describe the video
          <textarea className="input min-h-24" dir="auto" maxLength={6000} value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Describe the scene, camera movement, subject action, lighting, style and mood…"/>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Video model
            <select className="input" value={modelId} onChange={(e)=>setModelId(e.target.value)} disabled={busy}>
              <option value="auto">Auto · cheapest compatible model</option>
              {models.map((model)=><option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Duration
            <select className="input" value={duration} onChange={(e)=>setDuration(Number(e.target.value))}>
              {choices.durations.map((seconds)=><option key={seconds} value={seconds}>{seconds} seconds</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Aspect ratio
            <select className="input" value={aspectRatio} onChange={(e)=>setAspectRatio(e.target.value)}>
              {choices.ratios.map((ratio)=><option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Resolution
            <select className="input" value={resolution} onChange={(e)=>setResolution(e.target.value)}>
              {choices.resolutions.map((item)=><option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {choices.audio&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={generateAudio} onChange={(e)=>setGenerateAudio(e.target.checked)}/>Generate audio where supported</label>}
        {choices.frame&&<div className="space-y-2"><p className="text-sm font-semibold">First-frame image (optional)</p><AttachmentPicker value={frame} onChange={(items)=>setFrame(items.slice(0,1))} disabled={busy} onUploadingChange={setUploading}/><p className="text-xs text-muted-foreground">Only compatible models can use this image as the exact opening frame.</p></div>}
        <p className="text-xs text-muted-foreground">{creditsPerSecond>0?'Estimated credit reservation: '+(creditsPerSecond*duration)+' credits ('+creditsPerSecond+' per second). Failed jobs release their reservation.':'Video credit pricing is not configured by the administrator yet.'}</p>
        <button className="btn-primary" disabled={busy||uploading||!models.length||prompt.trim().length<3||!choices.durations.length||creditsPerSecond<=0} onClick={generate}>
          {busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}{busy?'Submitting…':'Generate video'}
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2"><div><h3 className="text-lg font-extrabold">Your video jobs</h3><p className="text-xs text-muted-foreground">Active jobs refresh automatically about every 30 seconds.</p></div><button className="btn-ghost text-xs" onClick={()=>Promise.all([loadModels(),loadJobs()]).catch((e)=>setError(e.message))}><RefreshCw className="h-3.5 w-3.5"/>Refresh</button></div>
        {jobs.length===0?<div className="card p-8 text-center text-sm text-muted-foreground">Your generated videos will appear here.</div>:jobs.map((job)=>(
          <article key={job.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="badge capitalize">{job.status}</span><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{job.model}</span><button className="btn-ghost text-xs" onClick={()=>pollJob(job.id)} disabled={!ACTIVE.has(job.status)}><RefreshCw className="h-3.5 w-3.5"/>Check status</button></div>
            <p dir="auto" className="whitespace-pre-wrap text-sm">{job.prompt}</p>
            {job.downloadUrl&&<><video className="max-h-[480px] w-full rounded-2xl bg-black" controls playsInline src={job.downloadUrl}/><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Credits charged: {job.creditsCharged}</span><a className="btn-outline text-xs" href={job.downloadUrl} target="_blank" rel="noopener noreferrer" download><Download className="h-4 w-4"/>Download video</a></div></>}
            {job.error&&<p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{job.error}</p>}
          </article>
        ))}
      </section>
      {error&&<p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
