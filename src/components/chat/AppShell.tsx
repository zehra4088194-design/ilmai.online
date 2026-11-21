'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Pin, Pencil, Trash2, Settings, ShieldCheck, Menu, X, Image as ImageIcon, Video, GraduationCap, FolderKanban, Library as LibraryIcon } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { cn, fmtNum } from '@/lib/utils';
import type { UserFeature } from '@/lib/features';
import { useAppearance, DEFAULT_APPEARANCE, type Appearance } from '@/components/providers';

export type Conv = { id: string; title: string; model: string | null; mode: string | null; pinned: boolean; updated_at: string };
export type ShellUser = { id: string; name: string; email: string; plan: string; credits: number; isAdmin: boolean; appearance?: Partial<Appearance> | null };

type Ctx = {
  user: ShellUser;
  credits: number;
  features: UserFeature[];
  conversations: Conv[];
  refreshConversations: () => Promise<void>;
  refreshMe: () => Promise<void>;
  openSidebar: () => void;
  featureOn: (key: string) => boolean;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppShell');
  return c;
};

export function AppShell({ user, features, announcement, banner, children }: {
  user: ShellUser; features: UserFeature[]; announcement: { enabled: boolean; text: string }; banner?: { title: string; altText: string; url: string } | null; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { updateAppearance, loaded: appearanceLoaded } = useAppearance();
  const [credits, setCredits] = useState(user.credits);
  const [conversations, setConversations] = useState<Conv[]>([]);
  const pathname = usePathname();

  const refreshConversations = useCallback(async () => {
    const r = await fetch('/api/conversations', { cache: 'no-store' });
    if (r.ok) setConversations((await r.json()).conversations);
  }, []);
  const refreshMe = useCallback(async () => {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (r.ok) setCredits((await r.json()).credits);
  }, []);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);
  useEffect(() => { if (appearanceLoaded) { try { if (!localStorage.getItem('ilm-appearance') && user.appearance) updateAppearance({ ...DEFAULT_APPEARANCE, ...user.appearance }); } catch { if (user.appearance) updateAppearance({ ...DEFAULT_APPEARANCE, ...user.appearance }); } } }, [appearanceLoaded, user.appearance, updateAppearance]);
  useEffect(() => setOpen(false), [pathname]);

  const featureOn = useCallback((key: string) => features.some((f) => f.key === key && f.state === 'active'), [features]);
  const value = useMemo(() => ({
    user, credits, features, conversations, refreshConversations, refreshMe,
    openSidebar: () => setOpen(true), featureOn,
  }), [user, credits, features, conversations, refreshConversations, refreshMe, featureOn]);

  return (
    <AppCtx.Provider value={value}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside className="hidden w-[16rem] shrink-0 border-r border-border bg-card lg:flex">
          <Sidebar />
        </aside>

        <AnimatePresence>
          {open && (
            <>
              <motion.div className="fixed inset-0 z-40 bg-black/65 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
              <motion.aside className="fixed inset-y-0 left-0 z-50 flex w-[16rem] max-w-[88vw] border-r border-border bg-card lg:hidden" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                <button className="btn-ghost absolute right-2 top-2 z-10 h-8 w-8 !p-0" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
                <Sidebar />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {banner?.url && (
            <div className="relative w-full overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={banner.url} alt={banner.altText || banner.title || 'Ilm AI announcement'} className="max-h-32 w-full object-cover sm:max-h-40" />
            </div>
          )}
          {announcement.enabled && announcement.text && (
            <div className="flex items-center justify-center gap-2 bg-primary px-4 py-1 text-center text-xs font-semibold text-primary-foreground">{announcement.text}</div>
          )}
          {children}
        </main>
      </div>
    </AppCtx.Provider>
  );
}

function Sidebar() {
  const { user, credits, features, conversations, refreshConversations } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');

  const activeId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;
  const list = conversations.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  const imageFeature = features.find((f) => f.key === 'image_generation');
  const videoFeature = features.find((f) => f.key === 'video_generation');

  async function act(id: string, kind: 'pin' | 'rename' | 'delete', c: Conv) {
    if (kind === 'delete') {
      if (!confirm('Delete this chat?')) return;
      await fetch('/api/conversations/' + id, { method: 'DELETE' });
      if (activeId === id) router.push('/chat');
    } else if (kind === 'rename') {
      const title = prompt('Rename chat', c.title)?.trim();
      if (!title) return;
      await fetch('/api/conversations/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    } else {
      await fetch('/api/conversations/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !c.pinned }) });
    }
    refreshConversations();
  }

  const navClass = (href: string) => cn(
    'flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors',
    pathname === href || (href !== '/chat' && pathname.startsWith(href + '/')) || (href === '/chat' && pathname === '/chat')
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

  return (
    <div className="flex h-full w-full flex-col px-2.5 py-3">
      <div className="mb-4 flex h-9 items-center px-2"><Logo href="/chat" /></div>

      <Link href="/chat" className="mb-2 flex h-10 items-center gap-3 rounded-lg bg-muted px-3 text-[13px] font-semibold text-foreground transition hover:bg-muted/80">
        <Plus className="h-4 w-4 text-primary" />New Chat
      </Link>

      <nav className="space-y-0.5">
        {imageFeature && (
          <Link href="/tools/image_generation" className={navClass('/tools/image_generation')}>
            <ImageIcon className="h-4 w-4 text-primary" />Image Studio
            {imageFeature.state !== 'active' && <span className="ml-auto text-[10px] text-muted-foreground">{imageFeature.state === 'locked_plan' ? 'Locked' : 'Soon'}</span>}
          </Link>
        )}
        {videoFeature && (
          <Link href="/tools/video_generation" className={navClass('/tools/video_generation')}>
            <Video className="h-4 w-4 text-primary" />Video Studio
            {videoFeature.state !== 'active' && <span className="ml-auto text-[10px] text-muted-foreground">{videoFeature.state === 'locked_plan' ? 'Locked' : 'Soon'}</span>}
          </Link>
        )}
        <Link href="/education" className={navClass('/education')}>
          <GraduationCap className="h-4 w-4 text-primary" />Education
        </Link>
        <Link href="/projects" className={navClass('/projects')}>
          <FolderKanban className="h-4 w-4 text-primary" />Projects
        </Link>
        <Link href="/library" className={navClass('/library')}>
          <LibraryIcon className="h-4 w-4 text-primary" />Library
        </Link>
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-border pt-3">
        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent chats</div>
        <div className="relative mb-2 px-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input className="h-8 w-full rounded-lg border border-transparent bg-muted pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          {list.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">{q ? 'No chats found' : 'Your chats will appear here'}</p>}
          {list.map((c) => (
            <div key={c.id} className={cn('group relative rounded-lg transition', activeId === c.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <Link href={'/chat/' + c.id} className="block truncate px-2.5 py-2 pr-20 text-xs" dir="auto">
                {c.pinned && <Pin className="mr-1 inline h-3 w-3 text-primary" />}{c.title}
              </Link>
              <div className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex">
                <button className="rounded-md p-1.5 hover:bg-background" onClick={() => act(c.id, 'pin', c)} aria-label="Pin chat"><Pin className="h-3 w-3" /></button>
                <button className="rounded-md p-1.5 hover:bg-background" onClick={() => act(c.id, 'rename', c)} aria-label="Rename chat"><Pencil className="h-3 w-3" /></button>
                <button className="rounded-md p-1.5 text-danger hover:bg-background" onClick={() => act(c.id, 'delete', c)} aria-label="Delete chat"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-primary">{(user.name || user.email || 'A').slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-foreground">{user.name || 'Account'}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
            <span className="block text-[10px] text-muted-foreground">{user.isAdmin ? 'Unlimited' : fmtNum(credits) + ' credits'} · {user.plan.toUpperCase()}</span>
          </span>
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        {user.isAdmin && <Link href="/admin" className="btn-ghost h-8 w-8 !p-0" title="Admin panel"><ShieldCheck className="h-4 w-4 text-primary" /></Link>}
      </div>
    </div>
  );
}

export function MobileTopBar({ title, icon, children }: { title: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  const { openSidebar } = useApp();
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
      <button className="btn-ghost h-8 w-8 !p-0 lg:hidden" onClick={openSidebar} aria-label="Menu"><Menu className="h-4 w-4" /></button>
      {icon}<h1 className="min-w-0 truncate text-sm font-semibold sm:text-base">{title}</h1>
      <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}
