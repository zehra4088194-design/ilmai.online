'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAppearance } from '@/components/providers';

export function ThemeModeToggle() {
  const { updateAppearance, loaded } = useAppearance();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  if (!loaded) return <div aria-hidden className="h-9 w-[4.5rem] rounded-full border border-border bg-card/70"/>;
  return (
    <button type="button" onClick={()=>updateAppearance({mode: dark ? 'light' : 'dark'})} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
      {dark ? <Sun className="h-5 w-5"/> : <Moon className="h-4 w-4"/>}
    </button>
  );
}
