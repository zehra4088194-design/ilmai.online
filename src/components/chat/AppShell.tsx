'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Pin, Pencil, Trash2, Settings, ShieldCheck, Menu, X, Coins, Lock, Megaphone, ChevronDown, GraduationCap, School } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeControls';
import { iconFor, FEATURE_HREF } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { cn, fmtNum } from '@/lib/utils';
import type { UserFeature } from '@/lib/features';
import type { Mode } from '@/lib/modes';

export type Conv = { id: string; title: string; model: string | null; mode: string | null; pinned: boolean; updated_at: string };
export type Audience = 'student' | 'teacher';
export type ShellUser = { id: string; name: string; email: string; plan: string; credits: number; isAdmin: boolean; audience: Audience };

type Ctx = {
  user: ShellUser;
  credits: number;
  audience: Audience;
  modes: Mode[];
  features: UserFeature[];
  conversations: Conv[];
  refreshConversations: () => Promise<void>;
  refreshMe: () => Promise<void>;
  openSidebar: () => void;
  /** is a feature usable right now (admins always) */
  featureOn: (key: string) => boolean;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppShell');
  return c;
};

export function AppShell({ user, features, modes, announcement, children }: {
  user: ShellUser; features: UserFeature[]; modes: Mode[]; announcement: { enabled: boolean; text: string }; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [credits, setCredits] = useState(user.credits);
  const [audience, setAudience] = useState<Audience>(user.audience);
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
  useEffect(() => setOpen(false), [pathname]);

  const changeAudience = async (a: Audience) => {
    setAudience(a);
    await createClient().from('profiles').update({ audience: a }).eq('id', user.id); // column-granted, RLS-protected
  };

  const featureOn = useCallback((key: string) => features.some((f) => f.key === key && f.state === 'active'), [features]);

  const value = useMemo(() => ({ user, credits, audience, modes, features, conversations, refreshConversations, refreshMe, openSidebar: () => setOpen(true), featureOn }),
    [user, credits, audience, modes, features, conversations, refreshConversations, refreshMe, featureOn]);

  return (
    <AppCtx.Provider value={value}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="glass hidden w-[19.5rem] shrink-0 border-y-0 border-l-0 lg:flex"><Sidebar onAudience={changeAudience} /></aside>

        <AnimatePresence>
          {open && (
            <>
              <motion.div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
              <motion.aside className="glass fixed inset-y-0 left-0 z-50 flex w-[19.5rem] max-w-[88vw] bg-card lg:hidden" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                <button className="btn-ghost absolute right-2 top-2 z-10 h-8 w-8 !p-0" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
                <Sidebar onAudience={changeAudience} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="flex min-w-0 flex-1 flex-col">
          {announcement.enabled && announcement.text && (
            <div className="flex items-center justify-center gap-2 bg-primary px-4 py-1.5 text-center text-xs font-semibold text-primary-foreground"><Megaphone className="h-3.5 w-3.5 shrink-0" />{announcement.text}</div>
          )}
          {children}
        </main>
      </div>
    </AppCtx.Provider>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        {title}<ChevronDown className={cn('h-3.5 w-3.5 transition', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">{children}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

function Sidebar({ onAudience }: { onAudience: (a: Audience) => void }) {
  const { user, credits, audience, modes, features, conversations, refreshConversations } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState('');

  const activeId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;
  const activeConv = conversations.find((c) => c.id === activeId);
  const activeMode = activeId ? activeConv?.mode ?? null : sp.get('mode');

  const myModes = modes.filter((m) => m.audience === 'both' || m.audience === audience);
  const tools = features.filter((f) => FEATURE_HREF[f.key] && f.key !== 'text_chat');
  const list = conversations.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));

  async function act(id: string, kind: 'pin' | 'rename' | 'delete', c: Conv) {
    if (kind === 'delete') {
      if (!confirm('Delete this chat?')) return;
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (activeId === id) router.push('/chat');
    } else if (kind === 'rename') {
      const title = prompt('Rename chat', c.title)?.trim();
      if (!title) return;
      await fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    } else {
      await fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !c.pinned }) });
    }
    refreshConversations();
  }

  return (
    <div className="flex h-full w-full flex-col gap-2.5 p-3.5">
      <div className="flex items-center justify-between px-1 pt-1"><Logo href="/chat" /><ThemeToggle /></div>

      {/* Student / Teacher switch */}
      <div className="relative grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="I am a">
        {(['student', 'teacher'] as const).map((a) => (
          <button key={a} role="tab" aria-selected={audience === a} onClick={() => onAudience(a)} className="relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold capitalize transition-colors">
            {audience === a && <motion.span layoutId="aud-pill" className="absolute inset-0 -z-10 rounded-lg bg-card shadow-sm" transition={{ type: 'spring', damping: 26, stiffness: 340 }} />}
            {a === 'student' ? <GraduationCap className="h-4 w-4 text-primary" /> : <School className="h-4 w-4 text-primary" />}{a}
          </button>
        ))}
      </div>

      <Link href="/chat" className="btn-primary w-full !py-2.5 shadow-glow"><Plus className="h-4 w-4" /> New chat</Link>

      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
        {myModes.length > 0 && (
          <Section title={`${audience === 'teacher' ? 'Teacher' : 'Student'} modes`}>
            <nav className="space-y-0.5">
              {myModes.map((m) => {
                const Icon = iconFor(m.icon);
                const on = activeMode === m.slug;
                return (
                  <Link key={m.id} href={`/chat?mode=${m.slug}`} title={m.description} className={cn('group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition', on ? 'bg-accent' : 'hover:bg-muted')}>
                    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg transition', on ? 'bg-primary text-primary-foreground' : 'bg-accent text-primary group-hover:bg-primary group-hover:text-primary-foreground')}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold leading-tight">{m.name}</span>{m.name_ur && <span className="font-urdu block truncate text-[11px] leading-snug text-muted-foreground" dir="rtl">{m.name_ur}</span>}</span>
                  </Link>
                );
              })}
            </nav>
          </Section>
        )}

        {tools.length > 0 && (
          <Section title="Tools" defaultOpen={false}>
            <nav className="space-y-0.5">
              {tools.map((f) => {
                const Icon = iconFor(f.icon);
                const href = FEATURE_HREF[f.key]!;
                const locked = f.state !== 'active';
                return (
                  <Link key={f.key} href={href} className={cn('flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition', pathname === href ? 'bg-accent' : 'hover:bg-muted', locked && 'opacity-70')}>
                    <Icon className="h-4 w-4 text-primary" /><span className="flex-1 truncate">{f.label}</span>
                    {f.state === 'coming_soon' && <span className="badge !px-2 !py-0 text-[10px]">Soon</span>}
                    {f.state === 'locked_plan' && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Link>
                );
              })}
            </nav>
          </Section>
        )}

        <Section title="Chats">
          <div className="relative mb-1.5"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className="input !rounded-xl !py-2 !pl-9" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="space-y-0.5">
            {list.length === 0 && <p className="px-2 py-5 text-center text-xs text-muted-foreground">{q ? 'No chats found' : 'Your chats will appear here'}</p>}
            {list.map((c) => (
              <div key={c.id} className={cn('group relative rounded-xl transition', activeId === c.id ? 'bg-accent' : 'hover:bg-muted')}>
                <Link href={`/chat/${c.id}`} className="block truncate px-3 py-2 pr-[5.5rem] text-sm" dir="auto">{c.pinned && <Pin className="mr-1.5 inline h-3 w-3 text-primary" />}{c.title}</Link>
                <div className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex">
                  <button className="rounded-lg p-1.5 hover:bg-background" onClick={() => act(c.id, 'pin', c)} aria-label="Pin"><Pin className="h-3.5 w-3.5" /></button>
                  <button className="rounded-lg p-1.5 hover:bg-background" onClick={() => act(c.id, 'rename', c)} aria-label="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                  <button className="rounded-lg p-1.5 text-danger hover:bg-background" onClick={() => act(c.id, 'delete', c)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="card space-y-2.5 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-semibold"><Coins className="h-4 w-4 text-primary" />{user.isAdmin ? '∞' : fmtNum(credits)} credits</span>
          <span className="badge uppercase">{user.plan}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name || 'Student'}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
          {user.isAdmin && <Link href="/admin" className="btn-ghost h-9 w-9 !p-0" title="Admin panel"><ShieldCheck className="h-[18px] w-[18px] text-primary" /></Link>}
          <Link href="/settings" className="btn-ghost h-9 w-9 !p-0" title="Settings"><Settings className="h-[18px] w-[18px]" /></Link>
        </div>
      </div>
    </div>
  );
}

export function MobileTopBar({ title, icon, children }: { title: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  const { openSidebar } = useApp();
  return (
    <div className="glass flex h-14 shrink-0 items-center gap-2 border-x-0 border-t-0 px-3">
      <button className="btn-ghost h-9 w-9 !p-0 lg:hidden" onClick={openSidebar} aria-label="Menu"><Menu className="h-5 w-5" /></button>
      {icon}<h1 className="min-w-0 truncate text-sm font-bold sm:text-base">{title}</h1>
      <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}
