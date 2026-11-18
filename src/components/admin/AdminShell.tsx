'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ToggleRight, Cpu, Users, Activity, HardDrive, Puzzle, Settings2, ArrowLeft, Menu, X, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeControls';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Overview', Icon: LayoutDashboard },
  { href: '/admin/features', label: 'Features', Icon: ToggleRight },
  { href: '/admin/models', label: 'Models', Icon: Cpu },
  { href: '/admin/users', label: 'Users & credits', Icon: Users },
  { href: '/admin/usage', label: 'Usage log', Icon: Activity },
  { href: '/admin/media', label: 'Media (B2)', Icon: HardDrive },
  { href: '/admin/skills', label: 'Teacher skills', Icon: Puzzle },
  { href: '/admin/settings', label: 'Settings', Icon: Settings2 },
];

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <div className="flex h-full flex-col gap-1 p-3.5">
      <div className="mb-3 flex items-center justify-between px-1"><Logo href="/admin" /><ThemeToggle /></div>
      <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-primary"><ShieldCheck className="h-3.5 w-3.5" />Admin panel</p>
      {NAV.map(({ href, label, Icon }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', active ? 'bg-primary text-primary-foreground shadow-soft' : 'hover:bg-muted')}>
            <Icon className="h-[18px] w-[18px]" />{label}
          </Link>
        );
      })}
      <div className="mt-auto space-y-2 pt-4">
        <Link href="/chat" className="btn-outline w-full"><ArrowLeft className="h-4 w-4" />Back to app</Link>
        <p className="truncate px-1 text-center text-xs text-muted-foreground">{email}</p>
      </div>
    </div>
  );
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="glass hidden w-64 shrink-0 border-y-0 border-l-0 lg:block">{nav}</aside>
      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn('glass fixed inset-y-0 left-0 z-50 w-64 bg-card transition-transform lg:hidden', open ? 'translate-x-0' : '-translate-x-full')}>
        <button className="btn-ghost absolute right-2 top-2 h-8 w-8 !p-0" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>{nav}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="glass flex h-14 items-center gap-2 border-x-0 border-t-0 px-3 lg:hidden"><button className="btn-ghost h-9 w-9 !p-0" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button><span className="font-bold">Admin</span></div>
        <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div></div>
      </main>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>{sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}</div>
      {children}
    </div>
  );
}
