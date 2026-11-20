'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FileText, Image, Presentation, Video, X } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

type Asset = {
  id: string; kind: string; mime: string | null; sizeBytes: number | null;
  name: string; prompt: string | null; model: string | null; createdAt: string;
  addedAt: string; downloadUrl: string;
};
type Project = { id: string; name: string; description: string; status: string; created_at: string; updated_at: string };
const sizeLabel = (value: number | null) => value === null ? '' : value < 1024 * 1024 ? Math.round(value / 1024) + ' KB' : (value / (1024 * 1024)).toFixed(1) + ' MB';

export function ProjectDetailTool({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const data = await api<{ project: Project; assets: Asset[] }>('/api/projects/' + projectId, 'GET');
    setProject(data.project);
    setAssets(data.assets ?? []);
  }, [projectId]);

  useEffect(() => { refresh().catch((e) => setError(e instanceof Error ? e.message : 'Could not load project')); }, [refresh]);

  async function unlink(asset: Asset) {
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/projects/' + projectId + '/assets', 'DELETE', { assetId: asset.id });
      await refresh();
      toast('Removed from project. The file remains in your Library.', 'ok');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not unlink file'); }
    finally { setBusy(false); }
  }

  function icon(kind: string) {
    if (kind === 'image') return Image;
    if (kind === 'video') return Video;
    if (kind === 'pptx') return Presentation;
    return FileText;
  }

  if (!project) return <div className="card p-8 text-center text-sm text-muted-foreground">{error || 'Loading project…'}</div>;
  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-4 sm:p-6">
        <Link href="/projects" className="btn-ghost mb-3 text-xs"><ArrowLeft className="h-3.5 w-3.5" /> All projects</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words text-xl font-extrabold">{project.name}</h2>{project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}<p className="mt-2 text-xs text-muted-foreground capitalize">{project.status} · {assets.length} linked files</p></div>
          <Link href={'/library?projectId=' + encodeURIComponent(projectId)} className="btn-primary text-xs">Add from Library</Link>
        </div>
      </div>
      {assets.length === 0 ? <div className="card p-8 text-center"><FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="font-semibold">This project is empty</p><p className="mt-1 text-sm text-muted-foreground">Add uploaded files or generated assets from your Library.</p></div> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {assets.map((asset) => {
            const Icon = icon(asset.kind);
            return <article key={asset.id} className="card flex min-w-0 items-start gap-3 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{asset.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{asset.kind.toUpperCase()} · {sizeLabel(asset.sizeBytes)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{asset.prompt || asset.model || asset.mime}</p><p className="mt-1 text-[11px] text-muted-foreground">Added {new Date(asset.addedAt).toLocaleDateString()}</p><a className="mt-2 inline-block text-xs font-semibold text-primary underline" href={asset.downloadUrl} target="_blank" rel="noopener noreferrer">Download</a></div>
              <button className="btn-ghost h-8 w-8 !p-0 text-danger" aria-label="Remove from project" title="Remove from project" disabled={busy} onClick={() => unlink(asset)}><X className="h-4 w-4" /></button>
            </article>;
          })}
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
