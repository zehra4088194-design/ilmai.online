'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Pin, Pencil, Trash2, ShieldCheck, Menu, X, Image as ImageIcon, Video, GraduationCap, FolderKanban, Library as LibraryIcon, Folder, FolderPlus, FolderInput, CreditCard, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Coins } from 'lucide-react';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { ThemeModeToggle } from '@/components/chat/ThemeModeToggle';
import { cn, fmtNum } from '@/lib/utils';
import type { UserFeature } from '@/lib/features';
import { useAppearance, DEFAULT_APPEARANCE, type Appearance, useToast } from '@/components/providers';

export type Conv = { id: string; title: string; model: string | null; mode: string | null; pinned: boolean; folder_id: string | null; updated_at: string };
export type ChatFolder = { id: string; name: string; color: string; created_at: string; updated_at: string };
export type ShellUser = { id: string; name: string; email: string; plan: string; credits: number; isAdmin: boolean; appearance?: Partial<Appearance> | null };

type Ctx = {
  user: ShellUser;
  credits: number;
  features: UserFeature[];
  conversations: Conv[];
  folders: ChatFolder[];
  refreshFolders: () => Promise<void>;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { updateAppearance, loaded: appearanceLoaded } = useAppearance();
  const [credits, setCredits] = useState(user.credits);
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const pathname = usePathname();

  const refreshConversations = useCallback(async () => {
    const r = await fetch('/api/conversations', { cache: 'no-store' });
    if (r.ok) setConversations((await r.json()).conversations);
  }, []);
  const refreshFolders = useCallback(async () => {
    const r = await fetch('/api/chat-folders', { cache: 'no-store' });
    if (r.ok) setFolders((await r.json()).folders);
  }, []);

  const refreshMe = useCallback(async () => {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (r.ok) setCredits((await r.json()).credits);
  }, []);

  useEffect(() => { refreshConversations(); refreshFolders(); }, [refreshConversations, refreshFolders]);
  useEffect(() => { if (appearanceLoaded) { try { if (!localStorage.getItem('ilm-appearance') && user.appearance) updateAppearance({ ...DEFAULT_APPEARANCE, ...user.appearance }); } catch { if (user.appearance) updateAppearance({ ...DEFAULT_APPEARANCE, ...user.appearance }); } } }, [appearanceLoaded, user.appearance, updateAppearance]);
  useEffect(() => setOpen(false), [pathname]);

  const featureOn = useCallback((key: string) => features.some((f) => f.key === key && f.state === 'active'), [features]);
  const value = useMemo(() => ({
    user, credits, features, conversations, folders, refreshFolders, refreshConversations, refreshMe,
    openSidebar: () => setOpen(true), featureOn,
  }), [user, credits, features, conversations, folders, refreshFolders, refreshConversations, refreshMe, featureOn]);

  return (
    <AppCtx.Provider value={value}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside className={cn('hidden shrink-0 border-r border-border bg-card transition-[width] duration-200 lg:flex',sidebarCollapsed?'w-[4.25rem]':'w-[16rem]')}>
          <Sidebar collapsed={sidebarCollapsed} onCollapse={()=>setSidebarCollapsed(value=>!value)} />
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

        <main className="app-main relative flex min-w-0 flex-1 flex-col">
          {(pathname==='/chat'||pathname.startsWith('/chat/'))&&(
            <div className="flex h-12 shrink-0 items-center gap-2 px-3 sm:px-4">
              <button type="button" className="btn-ghost h-9 w-9 !p-0 lg:hidden" onClick={()=>setOpen(true)} aria-label="Open menu"><Menu className="h-4 w-4"/></button>
              <div className="ml-auto"><ThemeModeToggle/></div>
            </div>
          )}
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

function groupByDate(items: Conv[]) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: { label: string; items: Conv[] }[] = [
    { label: 'Pinned', items: [] }, { label: 'Today', items: [] }, { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] }, { label: 'Older', items: [] },
  ];
  for (const chat of items) {
    if (chat.pinned) { groups[0].items.push(chat); continue; }
    const t = new Date(chat.updated_at).getTime();
    if (t >= startToday) groups[1].items.push(chat);
    else if (t >= startToday - day) groups[2].items.push(chat);
    else if (t >= startToday - 7 * day) groups[3].items.push(chat);
    else groups[4].items.push(chat);
  }
  return groups.filter((g) => g.items.length > 0);
}

function Sidebar({ collapsed=false, onCollapse }: { collapsed?:boolean; onCollapse?:()=>void }) {
  const { user, credits, features, conversations, folders, refreshFolders, refreshConversations } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [moveChatId, setMoveChatId] = useState<string | null>(null);
  const toast = useToast();

  const activeId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;
  const search = q.trim().toLowerCase();
  const matches = (c: Conv) => !search || (c.title || 'New chat').toLowerCase().includes(search);
  // Chats inside a folder live under that folder; everything else is one simple list grouped by date.
  // While searching, every chat is searched (folder or not).
  const looseChats = conversations.filter((c) => matches(c) && (search ? true : !c.folder_id));
  const chatGroups = groupByDate(looseChats);
  const imageFeature = features.find((f) => f.key === 'image_generation');
  const videoFeature = features.find((f) => f.key === 'video_generation');

  async function folderRequest(url: string, method: 'POST'|'PATCH'|'DELETE', body?: unknown) {
    const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not update folders');
    return result;
  }

  async function createFolder() {
    const name = prompt('Folder name (up to 40 characters)')?.trim();
    if (!name) return;
    try {
      await folderRequest('/api/chat-folders', 'POST', { name });
      await refreshFolders();
      toast('Folder created', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not create folder', 'err'); }
  }

  async function renameFolder(folder: ChatFolder) {
    const name = prompt('Rename folder', folder.name)?.trim();
    if (!name || name === folder.name) return;
    try {
      await folderRequest('/api/chat-folders/' + folder.id, 'PATCH', { name });
      await refreshFolders();
      toast('Folder renamed', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not rename folder', 'err'); }
  }

  async function cycleFolderColor(folder: ChatFolder) {
    const colors = ['#22c55e','#a78bfa','#f472b6','#60a5fa','#f59e0b','#22d3ee','#fb7185','#a3e635'];
    const next = colors[(colors.indexOf(folder.color) + 1) % colors.length];
    try {
      await folderRequest('/api/chat-folders/' + folder.id, 'PATCH', { color: next });
      await refreshFolders();
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not change folder colour', 'err'); }
  }

  async function deleteFolder(folder: ChatFolder) {
    if (!confirm(`Delete folder "${folder.name}"? Its chats will stay in All chats.`)) return;
    try {
      await folderRequest('/api/chat-folders/' + folder.id, 'DELETE');
      await Promise.all([refreshFolders(), refreshConversations()]);
      toast('Folder deleted. Its chats are safe in All chats.', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete folder', 'err'); }
  }

  async function moveChat(chatId: string, folderId: string) {
    try {
      const response = await fetch('/api/conversations/' + chatId, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folderId || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not move chat');
      setMoveChatId(null);
      await refreshConversations();
      toast(folderId ? 'Chat moved to folder' : 'Chat moved to All chats', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not move chat', 'err'); }
  }

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
    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
    pathname === href || (href !== '/chat' && pathname.startsWith(href + '/')) || (href === '/chat' && pathname === '/chat')
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

  if(collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center gap-3 px-2 py-3">
        <LogoMark className="h-8 w-8"/>
        <button type="button" onClick={()=>router.push('/chat')} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-muted/60 text-primary hover:bg-accent" title="New chat" aria-label="New chat"><Plus className="h-4 w-4"/></button>
        <nav className="flex w-full flex-1 flex-col items-center gap-2 pt-1">
          <Link href="/tools/image_generation" className={cn('grid h-9 w-9 place-items-center rounded-xl hover:bg-muted',pathname.startsWith('/tools/image_generation')?'bg-accent text-primary':'text-muted-foreground')} title="Photo Studio" aria-label="Photo Studio"><ImageIcon className="h-4 w-4"/></Link>
          {videoFeature&&<Link href="/tools/video_generation" className={cn('grid h-9 w-9 place-items-center rounded-xl hover:bg-muted',pathname.startsWith('/tools/video_generation')?'bg-accent text-primary':'text-muted-foreground')} title="Video Studio" aria-label="Video Studio"><Video className="h-4 w-4"/></Link>}
          <Link href="/education" className={cn('grid h-9 w-9 place-items-center rounded-xl hover:bg-muted',pathname.startsWith('/education')?'bg-accent text-primary':'text-muted-foreground')} title="Education" aria-label="Education"><GraduationCap className="h-4 w-4"/></Link>
          <Link href="/projects" className={cn('grid h-9 w-9 place-items-center rounded-xl hover:bg-muted',pathname.startsWith('/projects')?'bg-accent text-primary':'text-muted-foreground')} title="Projects" aria-label="Projects"><FolderKanban className="h-4 w-4"/></Link>
          <Link href="/library" className={cn('grid h-9 w-9 place-items-center rounded-xl hover:bg-muted',pathname.startsWith('/library')?'bg-accent text-primary':'text-muted-foreground')} title="Library" aria-label="Library"><LibraryIcon className="h-4 w-4"/></Link>
          <Link href="/pricing" className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted" title="Pricing & plans" aria-label="Pricing and plans"><CreditCard className="h-4 w-4"/></Link>
        </nav>
        <div className="flex flex-col items-center gap-2 border-t border-border pt-3">
          <button type="button" onClick={onCollapse} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-primary" title="Expand sidebar" aria-label="Expand sidebar"><PanelLeftOpen className="h-4 w-4"/></button>
          <Link href="/settings" className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-bold text-primary" title="Account settings" aria-label="Account settings">{(user.name||user.email||'A').slice(0,1).toUpperCase()}</Link>
          {user.isAdmin&&<Link href="/admin" className="grid h-9 w-9 place-items-center rounded-xl text-primary hover:bg-muted" title="Admin panel" aria-label="Admin panel"><ShieldCheck className="h-4 w-4"/></Link>}
        </div>
      </div>
    );
  }

  function renderChatRow(chat: Conv, nested = false) {
    return (
      <div key={chat.id} className={cn('group relative rounded-lg transition', activeId===chat.id?'bg-muted text-foreground':'text-muted-foreground hover:bg-muted hover:text-foreground')}>
        <Link href={'/chat/'+chat.id} className={cn('block truncate py-2 pl-2.5 text-xs md:pr-2.5 md:group-hover:pr-[6.5rem] md:group-focus-within:pr-[6.5rem]', 'pr-[6.5rem]', nested && 'text-[11px]')} dir="auto">
          {chat.pinned&&<Pin className="mr-1 inline h-3 w-3 text-primary"/>}{chat.title || 'New chat'}
        </Link>
        <div className="absolute right-1 top-1 flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button className="rounded-md p-1.5 hover:bg-background" onClick={()=>act(chat.id,'pin',chat)} aria-label="Pin chat" title="Pin chat"><Pin className="h-3 w-3"/></button>
          <button className="rounded-md p-1.5 hover:bg-background" onClick={()=>act(chat.id,'rename',chat)} aria-label="Rename chat" title="Rename chat"><Pencil className="h-3 w-3"/></button>
          <button className="rounded-md p-1.5 hover:bg-background" onClick={()=>setMoveChatId(moveChatId===chat.id?null:chat.id)} aria-label="Move chat to folder" title="Move chat to folder"><FolderInput className="h-3 w-3"/></button>
          <button className="rounded-md p-1.5 text-danger hover:bg-background" onClick={()=>act(chat.id,'delete',chat)} aria-label="Delete chat" title="Delete chat"><Trash2 className="h-3 w-3"/></button>
        </div>
        {moveChatId===chat.id&&<div className="absolute right-1 top-9 z-30 w-44 rounded-xl border border-border bg-card p-2 shadow-xl">
          <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Move to</label>
          <select autoFocus className="input h-8 py-1 text-xs" value={chat.folder_id??''} onChange={e=>moveChat(chat.id,e.target.value)}>
            <option value="">No folder</option>
            {folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </div>}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col px-2.5 py-3">
      <div className="mb-2 flex h-9 items-center justify-between px-1.5">
        <Logo href="/chat" />
        <button type="button" onClick={() => router.push('/chat')} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-muted/60 text-muted-foreground transition hover:border-primary/50 hover:bg-accent hover:text-primary" aria-label="New chat" title="New chat">
          <Plus className="h-4 w-4"/>
        </button>
      </div>


      <nav className="space-y-px">
        {imageFeature && (
        <Link href="/tools/image_generation" className={navClass('/tools/image_generation')}>
          <ImageIcon className="h-4 w-4 text-primary"/>Photo Studio
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

      <div className="relative mt-3 shrink-0 border-t border-border px-1 pt-2.5">
        <Search className="pointer-events-none absolute left-3.5 top-[1.2rem] h-3.5 w-3.5 text-muted-foreground"/>
        <input className="h-8 w-full rounded-lg border border-transparent bg-muted pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50" placeholder="Search chats" value={q} onChange={(e)=>setQ(e.target.value)} aria-label="Search chats"/>
      </div>

      <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        {(folders.length>0 || !search) && (
          <section>
            <div className="flex items-center gap-1 px-1">
              <button type="button" onClick={()=>setFoldersExpanded((value)=>!value)} aria-expanded={foldersExpanded}
                className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground">
                {foldersExpanded?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronRight className="h-3.5 w-3.5"/>}
                <span>Folders</span><span className="ml-auto text-[10px] font-normal">{folders.length}</span>
              </button>
              <button type="button" onClick={createFolder} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary" aria-label="Create folder" title="Create folder"><FolderPlus className="h-4 w-4"/></button>
            </div>
            {foldersExpanded && <div className="mt-1 space-y-0.5">
              {folders.length===0&&<p className="px-3 py-2 text-xs text-muted-foreground">No folders yet. Tap + to create one.</p>}
              {folders.map(folder=>{
                const folderChats=conversations.filter(c=>c.folder_id===folder.id&&matches(c));
                const isExpanded=expandedFolderIds.includes(folder.id)||(!!search&&folderChats.length>0);
                return <div key={folder.id} className="rounded-lg">
                  <div className="group/folder flex min-h-8 items-center rounded-lg hover:bg-muted/60">
                    <button type="button" onClick={()=>setExpandedFolderIds(old=>old.includes(folder.id)?old.filter(id=>id!==folder.id):[...old,folder.id])} aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground group-hover/folder:text-foreground">
                      {isExpanded?<ChevronDown className="h-3 w-3 shrink-0"/>:<ChevronRight className="h-3 w-3 shrink-0"/>}
                      <Folder className="h-3.5 w-3.5 shrink-0" style={{color:folder.color}}/>
                      <span className="truncate">{folder.name}</span><span className="ml-auto text-[10px] opacity-70">{folderChats.length}</span>
                    </button>
                    <div className="mr-1 flex items-center md:opacity-0 md:group-hover/folder:opacity-100 md:group-focus-within/folder:opacity-100">
                      <button type="button" onClick={()=>cycleFolderColor(folder)} className="rounded p-1 text-muted-foreground hover:text-primary" title="Change folder colour" aria-label="Change folder colour"><span className="block h-2.5 w-2.5 rounded-full" style={{background:folder.color}}/></button>
                      <button type="button" onClick={()=>renameFolder(folder)} className="rounded p-1 text-muted-foreground hover:text-primary" title="Rename folder" aria-label="Rename folder"><Pencil className="h-3 w-3"/></button>
                      <button type="button" onClick={()=>deleteFolder(folder)} className="rounded p-1 text-danger/70 hover:text-danger" title="Delete folder" aria-label="Delete folder"><Trash2 className="h-3 w-3"/></button>
                    </div>
                  </div>
                  {isExpanded&&<div className="mb-1 ml-4 space-y-0.5 border-l border-border pl-2">
                    {folderChats.length===0?<p className="px-2 py-2 text-[11px] text-muted-foreground">No chats in this folder</p>:folderChats.map(chat=>renderChatRow(chat,true))}
                  </div>}
                </div>;
              })}
            </div>}
          </section>
        )}

        <section className="space-y-2">
          {chatGroups.length===0&&<p className="px-2 py-4 text-xs text-muted-foreground">{search?'No chats found':'No chats yet. Start a new chat!'}</p>}
          {chatGroups.map(group=>(
            <div key={group.label}>
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{group.label}</p>
              <div className="space-y-0.5">{group.items.map(chat=>renderChatRow(chat))}</div>
            </div>
          ))}
        </section>
      </div>

      <div className="mt-3 shrink-0 space-y-2 border-t border-border pt-3">
        <Link href="/pricing" className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><CreditCard className="h-3.5 w-3.5"/>Pricing &amp; plans</Link>
        <div className="flex items-center gap-1.5">
          <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-muted" title="Open account settings">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">{(user.name || user.email || 'A').slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">{user.name || 'Account'}</span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">{user.email}</span>
            </span>
          </Link>
          {user.isAdmin && <Link href="/admin" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary hover:bg-muted" title="Admin panel" aria-label="Admin panel"><ShieldCheck className="h-4 w-4" /></Link>}
          <button type="button" onClick={onCollapse} className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary lg:grid" title="Collapse sidebar" aria-label="Collapse sidebar"><PanelLeftClose className="h-4 w-4"/></button>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2" title="Your remaining credits">
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground"><Coins className="h-3.5 w-3.5 shrink-0 text-primary"/><span className="truncate">{user.isAdmin ? 'Unlimited' : fmtNum(credits)}</span><span className="font-normal text-muted-foreground">credits</span></span>
          <span className="badge shrink-0 !px-2 !py-0 text-[10px] uppercase">{user.plan}</span>
        </div>
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
