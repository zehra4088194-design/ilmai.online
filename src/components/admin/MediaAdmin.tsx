'use client';
import { useEffect, useState } from 'react';
import { Trash2, FileText, Film, File as FileIcon, ExternalLink } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { fmtDate } from '@/lib/utils';

export type AdminMedia = { id: string; kind: string; mime: string | null; size_bytes: number | null; prompt: string | null; model: string | null; created_at: string; status: string; email: string | null };

function Thumb({ a }: { a: AdminMedia }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (a.kind !== 'image') return;
    api<{ url: string }>(`/api/admin/media?id=${a.id}`, 'GET').then((j) => setUrl(j.url)).catch(() => {});
  }, [a.id, a.kind]);
  if (a.kind === 'image') return url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={a.prompt ?? ''} className="aspect-square w-full object-cover" /> : <div className="aspect-square animate-pulse bg-muted" />;
  const I = a.kind === 'video' ? Film : a.kind === 'pdf' || a.kind === 'pptx' || a.kind === 'docx' ? FileText : FileIcon;
  return <div className="grid aspect-square place-items-center bg-muted"><I className="h-10 w-10 text-primary/60" /></div>;
}

export function MediaAdmin({ initial }: { initial: AdminMedia[] }) {
  const [items, setItems] = useState(initial);
  const toast = useToast();

  async function del(id: string) {
    if (!confirm('Delete this file from Backblaze and the database?')) return;
    try { await api('/api/admin/media', 'DELETE', { id }); setItems((x) => x.filter((m) => m.id !== id)); toast('Deleted', 'ok'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  }
  async function open(id: string) {
    try { const j = await api<{ url: string }>(`/api/admin/media?id=${id}`, 'GET'); window.open(j.url, '_blank'); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  }

  if (!items.length) return <div className="card p-10 text-center text-muted-foreground">No files yet. Generated images, videos, presentations and test PDFs will appear here.</div>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((a) => (
        <div key={a.id} className="card group overflow-hidden">
          <div className="relative"><Thumb a={a} />
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
              <button className="btn-outline !p-1.5" onClick={() => open(a.id)} aria-label="Open"><ExternalLink className="h-3.5 w-3.5" /></button>
              <button className="btn-danger !p-1.5" onClick={() => del(a.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="space-y-0.5 p-2.5 text-xs">
            <p className="flex items-center justify-between"><span className="badge">{a.kind}</span><span className="text-muted-foreground">{a.size_bytes ? `${(a.size_bytes / 1024).toFixed(0)} KB` : ''}</span></p>
            {a.prompt && <p className="line-clamp-2 text-muted-foreground" dir="auto">{a.prompt}</p>}
            <p className="truncate text-muted-foreground">{a.email ?? '—'} · {fmtDate(a.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
