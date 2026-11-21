'use client';
import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { ACCENTS, useAccent } from '@/components/providers';
import { cn } from '@/lib/utils';

export function AppearancePicker() {
  const { accent, setAccent } = useAccent();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-12" />;
  return (
    <div className="flex flex-wrap gap-3">
      {ACCENTS.map((a) => (
        <button key={a.id} onClick={() => setAccent(a.id)} title={a.label} aria-label={a.label}
          className={cn('relative grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-background transition hover:scale-110', accent === a.id && 'ring-2 ring-primary')}
          style={{ background: a.swatch }}>
          {accent === a.id && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
