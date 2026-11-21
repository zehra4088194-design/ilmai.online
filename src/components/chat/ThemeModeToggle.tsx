'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAppearance } from '@/components/providers';

export function ThemeModeToggle() {
  const { appearance, updateAppearance, loaded } = useAppearance();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  if (!loaded) return <div aria-hidden className="h-9 w-[4.5rem] rounded-full border border-border bg-card/70"/>;
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-lg backdrop-blur">
      <button type="button" onClick={()=>updateAppearance({mode:'light'})} aria-label="Use light mode" aria-pressed={!dark&&appearance.mode!=='system'}
        title="Light mode" className={`grid h-7 w-7 place-items-center rounded-full transition ${!dark?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted'}`}>
        <Sun className="h-3.5 w-3.5"/>
      </button>
      <button type="button" onClick={()=>updateAppearance({mode:'dark'})} aria-label="Use dark mode" aria-pressed={dark&&appearance.mode!=='system'}
        title="Dark mode" className={`grid h-7 w-7 place-items-center rounded-full transition ${dark?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted'}`}>
        <Moon className="h-3.5 w-3.5"/>
      </button>
    </div>
  );
}
