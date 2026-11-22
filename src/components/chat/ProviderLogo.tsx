'use client';
import { useState } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';
import { providerKey, providerLogoSources, providerName } from '@/lib/provider-meta';

type Props = { provider: string | null | undefined; className?: string };

function Inner({ provider, className }: Props) {
  const key = providerKey(provider);
  const sources = providerLogoSources(provider);
  const [index, setIndex] = useState(0);

  // The Ilm AI router entry uses the Ilm AI mark itself.
  if (key === 'ai router' || key === 'auto') return <LogoMark className={cn('h-8 w-8', className)} />;

  const src = sources[index];
  if (!src) {
    const initials = providerName(provider).replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || 'AI';
    return (
      <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-[0.65rem] font-bold text-primary', className)}>
        {initials}
      </span>
    );
  }
  return (
    <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-[18%] ring-1 ring-border', className)}>
      {/* Plain <img>: logo files are optional, so a missing file must fall back quietly (onError). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" onError={() => setIndex((i) => i + 1)} />
    </span>
  );
}

/** Real provider logo from /public/providers/<provider>.svg|png|webp, with an initials fallback. */
export function ProviderLogo(props: Props) {
  return <Inner key={providerKey(props.provider)} {...props} />;
}
