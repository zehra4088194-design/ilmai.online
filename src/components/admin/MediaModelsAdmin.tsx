'use client';

import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Video, Search, RefreshCw, Star, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

type MediaMode = 'image' | 'video';
type MediaAdminModel = {
  id: string;
  name: string;
  description: string;
  provider: string;
  release: string;
  features: string[];
  enabled: boolean;
  isDefault: boolean;
};
type CatalogResponse = { image: MediaAdminModel[]; video: MediaAdminModel[]; refreshedAt: string };

export function MediaModelsAdmin() {
  const [mode, setMode] = useState<MediaMode>('image');
  const [catalog, setCatalog] = useState<CatalogResponse>({ image: [], video: [], refreshedAt: '' });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const toast = useToast();

  async function load(force = false) {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await api<CatalogResponse>('/api/admin/media-models' + (force ? '?refresh=1' : ''), 'GET');
      setCatalog(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Picsart models');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const models = catalog[mode] ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((model) => !q ||
      model.name.toLowerCase().includes(q) ||
      model.id.toLowerCase().includes(q) ||
      model.provider.toLowerCase().includes(q) ||
      model.description.toLowerCase().includes(q));
  }, [models, query]);
  const enabledCount = models.filter((model) => model.enabled).length;

  async function setEnabled(model: MediaAdminModel, enabled: boolean) {
    setBusyId(model.id);
    const previous = catalog;
    setCatalog((current) => ({
      ...current,
      [mode]: current[mode].map((item) => item.id === model.id
        ? { ...item, enabled, isDefault: enabled ? item.isDefault : false }
        : item),
    }));
    try {
      await api('/api/admin/media-models', 'PATCH', {
        action: 'set-enabled', mode, modelId: model.id, enabled,
      });
      toast(enabled ? 'Model enabled' : 'Model disabled', 'ok');
    } catch (e) {
      setCatalog(previous);
      toast(e instanceof Error ? e.message : 'Could not update model', 'err');
    } finally { setBusyId(null); }
  }

  async function setDefault(model: MediaAdminModel) {
    setBusyId(model.id);
    const previous = catalog;
    setCatalog((current) => ({
      ...current,
      [mode]: current[mode].map((item) => ({
        ...item,
        enabled: item.id === model.id ? true : item.enabled,
        isDefault: item.id === model.id,
      })),
    }));
    try {
      await api('/api/admin/media-models', 'PATCH', {
        action: 'set-default', mode, modelId: model.id,
      });
      toast('Default ' + mode + ' model saved', 'ok');
    } catch (e) {
      setCatalog(previous);
      toast(e instanceof Error ? e.message : 'Could not set default model', 'err');
    } finally { setBusyId(null); }
  }

  return (
    <section className="mt-8 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Picsart image &amp; video models</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Live catalogue from Picsart. New non-deprecated models appear after refresh; enable or disable each model and choose a default separately for image and video generation.
          </p>
        </div>
        <button className="btn-outline" onClick={() => load(true)} disabled={loading || refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh catalogue
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={mode === 'image' ? 'btn-primary' : 'btn-outline'} onClick={() => setMode('image')}>
          <ImageIcon className="h-4 w-4" /> Image models ({catalog.image.length})
        </button>
        <button className={mode === 'video' ? 'btn-primary' : 'btn-outline'} onClick={() => setMode('video')}>
          <Video className="h-4 w-4" /> Video models ({catalog.video.length})
        </button>
        <span className="text-xs text-muted-foreground">{enabledCount} of {models.length} enabled</span>
      </div>

      <div className="card space-y-3 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className="input !pl-9" placeholder="Search by model, provider or ID…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>

        {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading Picsart model catalogue…</div>}
        {error && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <p className="font-semibold">Picsart catalogue unavailable</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <p className="mt-2 text-muted-foreground">Set the <code>PICSART_API_KEY</code> secret on the <code>ilmai-ai-router</code> Cloudflare Worker, then refresh this catalogue.</p>
            <button className="btn-outline mt-3" onClick={() => load(true)} disabled={refreshing}>Try again</button>
          </div>
        )}
        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Model</th>
                    <th className="px-3">Provider</th>
                    <th className="px-3">Availability</th>
                    <th className="px-3 text-center">Default</th>
                    <th className="px-3 text-right">Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((model) => (
                    <tr key={model.id} className={model.enabled ? '' : 'opacity-60'}>
                      <td className="px-3 py-3">
                        <p className="font-semibold">{model.name}</p>
                        <p className="text-xs text-muted-foreground">{model.id}</p>
                        {model.description && <p className="mt-1 max-w-xl text-xs text-muted-foreground">{model.description}</p>}
                      </td>
                      <td className="px-3 whitespace-nowrap">{model.provider}</td>
                      <td className="px-3 capitalize">{model.release || 'Available'}</td>
                      <td className="px-3 text-center">
                        <button
                          type="button"
                          aria-label={'Set ' + model.name + ' as default'}
                          title="Set as default model"
                          disabled={!model.enabled || busyId !== null}
                          onClick={() => setDefault(model)}
                          className="rounded-lg p-2 transition hover:bg-muted disabled:cursor-not-allowed"
                        >
                          <Star className={'mx-auto h-4 w-4 ' + (model.isDefault ? 'fill-primary text-primary' : 'text-muted-foreground/50')} />
                        </button>
                      </td>
                      <td className="px-3 text-right">
                        <Switch checked={model.enabled} onChange={(value) => setEnabled(model, value)} label={'Enable ' + model.name} />
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No models match your search.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Disabled models stay in this list so you can re-enable them. Newly released models appear automatically after refreshing the catalogue. Custom IDs not supplied by Picsart cannot be made callable here.</p>
          </>
        )}
      </div>
    </section>
  );
}
