'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Archive, FolderKanban, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';

type Project = {
  id: string; name: string; description: string; status: 'active'|'archived';
  assetCount: number; created_at: string; updated_at: string;
};
const dateLabel = (value: string) => {
  try { return new Date(value).toLocaleDateString(); } catch { return value; }
};

export function ProjectsTool() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const data = await api<{ projects: Project[] }>('/api/projects', 'GET');
    setProjects(data.projects ?? []);
  }, []);

  useEffect(() => { refresh().catch((e) => setError(e instanceof Error ? e.message : 'Could not load projects')); }, [refresh]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await api('/api/projects', 'POST', { name, description });
      setName(''); setDescription('');
      await refresh();
      toast('Project created', 'ok');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create project'); }
    finally { setBusy(false); }
  }

  async function setStatus(project: Project) {
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/projects/' + project.id, 'PATCH', { status: project.status === 'active' ? 'archived' : 'active' });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update project'); }
    finally { setBusy(false); }
  }

  async function remove(project: Project) {
    if (busy || !window.confirm('Delete this project? Files in your Library will remain safe.')) return;
    setBusy(true);
    try {
      await api('/api/projects/' + project.id, 'DELETE');
      await refresh();
      toast('Project deleted. Original files remain in your Library.', 'ok');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete project'); }
    finally { setBusy(false); }
  }

  const visible = projects.filter((project) => showArchived || project.status === 'active');
  return (
    <div className="space-y-6">
      <section className="glass rounded-3xl p-4 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><FolderKanban className="h-5 w-5" /></div>
          <div><h2 className="text-xl font-extrabold">Your projects</h2><p className="mt-1 text-sm text-muted-foreground">Collect lesson materials, generated papers, presentations and other files in one workspace.</p></div>
        </div>
        <form onSubmit={createProject} className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Project name<input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 9 Biology — Term 1" required /></label>
          <label className="block space-y-1 text-sm font-medium">Description (optional)<textarea className="input min-h-20" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="What are you preparing or organizing?" /></label>
          <button className="btn-primary" disabled={busy || !name.trim()}><Plus className="h-4 w-4" /> Create project</button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-lg font-extrabold">Workspace</h3><p className="text-xs text-muted-foreground">{projects.length} projects · files remain in Library if a project is deleted</p></div>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>
            <button className="btn-ghost text-xs" onClick={() => refresh().catch((e) => setError(e.message))}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="card p-8 text-center"><FolderKanban className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="font-semibold">No projects yet</p><p className="mt-1 text-sm text-muted-foreground">Create a project above to group your work and files.</p></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((project) => (
              <article key={project.id} className="card space-y-3 p-4">
                <div className="flex items-start gap-2">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><FolderKanban className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate font-bold">{project.name}</p><p className="text-xs text-muted-foreground">{project.assetCount} files · Updated {dateLabel(project.updated_at)}</p></div>
                  <span className="badge capitalize">{project.status}</span>
                </div>
                {project.description && <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Link className="btn-primary text-xs" href={'/projects/' + project.id}>Open project</Link>
                  <button className="btn-ghost text-xs" disabled={busy} onClick={() => setStatus(project)}><Archive className="h-3.5 w-3.5" /> {project.status === 'active' ? 'Archive' : 'Restore'}</button>
                  <button className="btn-ghost text-xs text-danger" disabled={busy} onClick={() => remove(project)}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
