'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Check } from 'lucide-react';
import { ACCENTS, useAccent } from '@/components/providers';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button aria-label="Toggle theme" className={cn('btn-ghost h-9 w-9 !p-0', className)} onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      {mounted && resolvedTheme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-40" />;
  const modes = [
    { id: 'light', label: 'Light', Icon: Sun },
    { id: 'dark', label: 'Dark', Icon: Moon },
    { id: 'system', label: 'System', Icon: Monitor },
  ];
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold">Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {modes.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTheme(id)}
              className={cn('flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition', theme === id ? 'border-primary bg-accent text-accent-foreground shadow-soft' : 'border-border bg-card hover:bg-muted')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Accent colour</p>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button key={a.id} onClick={() => setAccent(a.id)} title={a.label} aria-label={a.label}
              className={cn('relative grid h-10 w-10 place-items-center rounded-full ring-offset-2 ring-offset-background transition hover:scale-110', accent === a.id && 'ring-2 ring-primary')}
              style={{ background: a.swatch }}>
              {accent === a.id && <Check className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
