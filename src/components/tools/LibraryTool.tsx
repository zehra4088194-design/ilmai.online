'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Image, Presentation, Search, Video, Music, FolderKanban, RefreshCw, Link2 } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

type Asset = {
  id: string; kind: string; mime: string | null; sizeBytes: number | null;
  name: string; prompt: string | null; model: string | null; createdAt: string; downloadUrl: string;
};
type Project = { id: string; name: string; status: string };
const kinds = ['all','image','video','audio','pdf','pptx','docx','file'] as const;
const niceSize = (value: number | null) => value === null ? '' : value < 1024 * 1024 ? Math.max(1, Math.round(value / 1024)) + ' KB' : (value / (1024 * 1024)).toFixed(1) + ' MB';

export function LibraryTool() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const projectId = searchParams.get('projectId');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<(typeof kinds)[number]>('all');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (kind !== 'all') params.set('kind', kind);
      if (projectId) params.set('projectId', projectId);
      const [library, projectList] = await Promise.all([
        api<{ assets: Asset[] }>('/api/library?' + params.toString(), 'GET'),
        api<{ projects: Project[] }>('/api/projects', 'GET'),
      ]);
      setAssets(library.assets ?? []);
      setProjects(projectList.projects ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load Library'); }
    finally { setLoading(false); }
  }, [q, kind, projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function addToProject(asset: Asset) {
    if (!projectId || busyId) return;
    setBusyId(asset.id);
    try {
      await api('/api/projects/' + projectId + '/assets', 'POST', { assetIds: [asset.id] });
      toast('File added to project', 'ok');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add file to project'); }
    finally { setBusyId(''); }
  }

  function icon(file: Asset) {
    if (file.kind === 'image') return Image;
    if (file.kind === 'video') return Video;
    if (file.kind === 'audio') return Music;
    if (file.kind === 'pptx') return Presentation;
    return FileText;
  }

  return (
    <div className="space-y-5">
      <section className="glass rounded-3xl p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="text-xl font-extrabold">Your Library</h2><p className="mt-1 text-sm text-muted-foreground">Uploads and generated assets stored in your private media space.</p></div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban className="h-5 w-5" /></div>
        </div>
        {projectId && <p className="mb-3 rounded-xl border border-border p-3 text-xs text-muted-foreground">Choose files to link to a project. Linking does not move, duplicate or expose the original file.</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input className="input pl-9" placeholder="Search files, prompts or models" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{kinds.map((item) => <option key={item} value={item}>{item === 'all' ? 'All file types' : item.toUpperCase()}</option>)}</select>
          <button className="btn-outline" onClick={() => refresh()}><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
        {projectId && <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="text-muted-foreground">Add to:</span>{projects.filter((p) => p.id === projectId).map((p) => <span key={p.id} className="badge">{p.name}</span>)}</div>}
      </section>

      {loading ? <div className="card p-8 text-center text-sm text-muted-foreground">Loading your files…</div> :
        assets.length === 0 ? <div className="card p-8 text-center"><FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="font-semibold">No matching files</p><p className="mt-1 text-sm text-muted-foreground">Upload a file in Chat or Test Studio, or generate a presentation to see it here.</p></div> :
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const Icon = icon(asset);
            return <article key={asset.id} className="card min-w-0 p-3">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{asset.name}</p><p className="text-[11px] text-muted-foreground">{asset.kind.toUpperCase()} · {niceSize(asset.sizeBytes)}</p><p className="mt-1 line-clamp-2 min-h-8 text-xs text-muted-foreground">{asset.prompt || asset.model || asset.mime}</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2"><span className="text-[11px] text-muted-foreground">{new Date(asset.createdAt).toLocaleDateString()}</span>
                <div className="flex gap-2"><a className="text-xs font-semibold text-primary underline" href={asset.downloadUrl} target="_blank" rel="noopener noreferrer">Download</a>{projectId && <button className="btn-ghost text-xs" disabled={busyId === asset.id} onClick={() => addToProject(asset)}><Link2 className="h-3.5 w-3.5" /> Add</button>}</div>
              </div>
            </article>;
          })}
        </div>
      }
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
