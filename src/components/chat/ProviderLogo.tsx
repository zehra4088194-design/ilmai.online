'use client';
import { useState } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';
import { providerKey, providerLogoSources, providerName } from '@/lib/provider-meta';

type Props = { provider: string | null | undefined; className?: string };

function Inner({ provider, className }: Props) {
  const key = providerKey(provider);
  const [lightIndex, setLightIndex] = useState(0);
  const [darkIndex, setDarkIndex] = useState(0);
  const lightSources = providerLogoSources(provider, 'light');
  const darkSources = providerLogoSources(provider, 'dark');
  const lightSrc = lightSources[lightIndex];
  const darkSrc = darkSources[darkIndex];
  const initials = providerName(provider).replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || 'AI';

  if (key === 'ai router' || key === 'auto') {
    return <LogoMark className={cn('h-8 w-8', className)} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid !h-7 !w-7 !min-w-7 !max-w-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-border dark:bg-slate-900',
        className,
      )}
    >
      {lightSrc ? (
        // Plain img is intentional: missing optional public assets advance to the next supported extension.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lightSrc}
          alt=""
          loading="lazy"
          draggable={false}
          className="block h-full w-full max-h-full max-w-full object-contain dark:hidden"
          onError={() => setLightIndex((index) => index + 1)}
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-[0.65rem] font-bold text-primary dark:hidden">
          {initials}
        </span>
      )}

      {darkSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={darkSrc}
          alt=""
          loading="lazy"
          draggable={false}
          className="hidden h-full w-full max-h-full max-w-full object-contain dark:block"
          onError={() => setDarkIndex((index) => index + 1)}
        />
      ) : (
        <span className="hidden h-full w-full place-items-center text-[0.65rem] font-bold text-primary dark:grid">
          {initials}
        </span>
      )}
    </span>
  );
}

/** Theme-aware provider logos with fallback to legacy single files and provider initials. */
export function ProviderLogo(props: Props) {
  return <Inner key={providerKey(props.provider)} {...props} />;
}
