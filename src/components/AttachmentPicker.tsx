'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, ImageIcon, Paperclip, X } from 'lucide-react';
import { api } from '@/lib/client-api';
import { sanitizeFilename, type Attachment, type UploadLimits } from '@/lib/attachment-validation';

/** URLs live only in browser memory and are refreshed on every click, never in message metadata. */
export function AttachmentLinks({ value, onRemove, disabled, previews = {} }: {
  value: Attachment[]; onRemove?: (id: string) => void; disabled?: boolean; previews?: Record<string, string>;
}) {
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  async function open(file: Attachment) {
    if (opening) return;
    setError(''); setOpening(file.asset_id);
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const { url } = await api<{ url: string }>(`/api/media/${encodeURIComponent(file.asset_id)}`, 'GET');
      if (!tab) throw new Error('Allow pop-ups to open attachments');
      tab.location.replace(url);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'Could not open attachment');
    } finally { setOpening(null); }
  }
  return <div>
    <div className="flex flex-wrap gap-2">
      {value.map((file) => <div key={file.asset_id} className="flex max-w-full items-center gap-1 rounded-xl border border-border bg-background p-1 text-foreground">
        <button type="button" onClick={() => open(file)} disabled={!!opening} title={`Open ${file.name}`}
          className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-muted">
          {previews[file.asset_id]
            // Temporary object URL for an already-verified local image, not a persisted provider URL.
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={previews[file.asset_id]} alt="" className="h-9 w-9 rounded object-cover" />
            : file.kind === 'image' ? <ImageIcon className="h-5 w-5 shrink-0" /> : <FileText className="h-5 w-5 shrink-0" />}
          <span dir="auto" className="max-w-48 truncate">{opening === file.asset_id ? 'Opening…' : file.name}</span>
        </button>
        {onRemove && <button type="button" disabled={disabled} className="btn-ghost h-7 w-7 !p-0" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.asset_id)}><X className="h-3.5 w-3.5" /></button>}
      </div>)}
    </div>
    {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
  </div>;
}

export function AttachmentPicker({ value, onChange, disabled = false, onUploadingChange, renderTrigger, compact = false }: {
  value: Attachment[]; onChange: (files: Attachment[]) => void; disabled?: boolean;
  /** Optional so hosts can lock their submit action during upload/finalization. */
  onUploadingChange?: (uploading: boolean) => void;
  /** Optional compact trigger for composer menus; uploads and validation stay in this component. */
  renderTrigger?: (open: () => void, disabled: boolean) => ReactNode;
  compact?: boolean;
}) {
  const [limits, setLimits] = useState<UploadLimits | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ name: string; percent: number; stage: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const values = useRef(value); values.current = value;
  const change = useRef(onChange); change.current = onChange;
  const uploadingChange = useRef(onUploadingChange); uploadingChange.current = onUploadingChange;
  const active = useRef(false);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const urls = useRef<Record<string, string>>({});

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    api<UploadLimits>('/api/media/upload-url', 'GET')
      .then((r) => { if (!cancelled) setLimits(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load upload limits'); });
    return () => {
      cancelled = true; mounted.current = false;
      controller.current?.abort(); xhr.current?.abort();
      uploadingChange.current?.(false);
      Object.values(urls.current).forEach(URL.revokeObjectURL); urls.current = {};
    };
  }, []);
  useEffect(() => {
    for (const id of Object.keys(urls.current)) {
      if (!value.some((file) => file.asset_id === id)) { URL.revokeObjectURL(urls.current[id]); delete urls.current[id]; }
    }
    setPreviews({ ...urls.current });
  }, [value]);

  async function upload(files: File[]) {
    if (disabled || active.current || !limits) return;
    const remaining = Math.max(0, limits.maxFiles - values.current.length);
    const queue = files.slice(0, remaining);
    const errors: string[] = files.length > remaining ? [`You can attach at most ${limits.maxFiles} files.`] : [];
    if (!queue.length) { setError(errors.join(' ')); return; }
    active.current = true; uploadingChange.current?.(true); setError('');
    const ac = new AbortController(); controller.current = ac;
    const request = async <T,>(url: string, method: string, body: unknown): Promise<T> => {
      const res = await fetch(url, { method, signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data as T;
    };
    try {
      // Deliberately sequential: neither files nor upload requests are an unbounded Promise.all.
      for (const file of queue) {
        if (ac.signal.aborted) break;
        const name = sanitizeFilename(file.name);
        try {
          const ext = file.name.split('.').pop()?.toLowerCase();
          const type = limits.types.find((t) => t.mime === file.type) ??
            limits.types.find((t) => t.ext === ext || (t.ext === 'jpg' && ext === 'jpeg'));
          if (!type) throw new Error('Unsupported file type');
          const limit = type.kind === 'file' ? limits.maxTextBytes : limits.maxBytes;
          if (!file.size || file.size > limit) throw new Error(`File must be between 1 byte and ${Math.round(limit / 1024)} KB`);
          setProgress({ name, percent: 0, stage: 'Preparing' });
          const ticket = await request<{ assetId: string; uploadUrl: string }>('/api/media/upload-url', 'POST', { name, mime: type.mime, size: file.size });
          if (ac.signal.aborted) break;
          await new Promise<void>((resolve, reject) => {
            const req = new XMLHttpRequest(); xhr.current = req;
            req.open('PUT', ticket.uploadUrl); req.timeout = 120_000;
            req.setRequestHeader('Content-Type', type.mime);
            req.upload.onprogress = (event) => {
              if (mounted.current) setProgress({ name, percent: event.lengthComputable ? Math.min(99, Math.round(event.loaded / event.total * 100)) : 0, stage: 'Uploading' });
            };
            req.onload = () => req.status >= 200 && req.status < 300 ? resolve() : reject(new Error('Storage upload failed'));
            req.onerror = () => reject(new Error('Storage upload failed; check your connection'));
            req.ontimeout = () => reject(new Error('Upload timed out'));
            req.onabort = () => reject(new Error('Upload cancelled'));
            req.send(file);
          });
          if (ac.signal.aborted) break;
          setProgress({ name, percent: 100, stage: 'Verifying' });
          const { attachment } = await request<{ attachment: Attachment }>(`/api/media/${ticket.assetId}`, 'PATCH', {});
          if (!mounted.current || ac.signal.aborted) break;
          if (attachment.kind === 'image') urls.current[attachment.asset_id] = URL.createObjectURL(file);
          const next = [...values.current, attachment];
          values.current = next; change.current(next); setPreviews({ ...urls.current });
        } catch (e) {
          if (ac.signal.aborted) break;
          errors.push(`${name}: ${e instanceof Error ? e.message : 'Upload failed'}`);
        }
      }
    } finally {
      active.current = false; xhr.current = null; controller.current = null;
      if (mounted.current) { setProgress(null); setError(errors.join(' ')); uploadingChange.current?.(false); }
    }
  }

  return <div className={`${compact ? '' : 'rounded-2xl p-2'} ${dragging ? 'bg-primary/10 ring-1 ring-primary' : ''}`
    onDragOver={(e) => { e.preventDefault(); if (!disabled && !active.current) setDragging(true); }}
    onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(Array.from(e.dataTransfer.files)); }}>
    {value.length > 0 && <div className={compact ? 'mb-2' : 'mb-2'}><AttachmentLinks value={value} previews={previews} disabled={disabled || !!progress} onRemove={(id) => onChange(value.filter((f) => f.asset_id !== id))} /></div>}
    <input ref={input} type="file" multiple className="hidden" aria-label="Choose attachments" disabled={disabled || !!progress || !limits}
      accept={limits?.types.map((t) => `.${t.ext},${t.mime}`).join(',')}
      onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    <div className={compact ? '' : 'flex flex-wrap items-center gap-2'}>
      {renderTrigger
        ? renderTrigger(() => input.current?.click(), disabled || !!progress || !limits || value.length >= (limits?.maxFiles ?? 0))
        : <button type="button" className="btn-ghost gap-1.5 px-2 text-xs" disabled={disabled || !!progress || !limits || value.length >= (limits?.maxFiles ?? 0)} onClick={() => input.current?.click()}>
            <Paperclip className="h-4 w-4" />Attach files
          </button>}
      {!compact && <span className="text-[11px] text-muted-foreground">{limits ? `or drop here · up to ${limits.maxFiles} files, ${Math.round(limits.maxBytes / 1024 / 1024)} MB each` : 'Loading upload limits…'}</span>}
    </div>
    {progress && <div role="status" className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 truncate" dir="auto">{progress.stage} {progress.name}</span>
      <progress aria-label="Upload progress" className="h-2 w-20 shrink-0 accent-primary" max={100} value={progress.percent} />
      <button type="button" className="btn-ghost text-xs" onClick={() => { controller.current?.abort(); xhr.current?.abort(); }}>Cancel</button>
    </div>}
    {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
  </div>;
}
