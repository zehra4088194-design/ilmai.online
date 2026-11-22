'use client';
import Image from 'next/image';
import { useAppearance, type LoaderStyle } from '@/components/providers';
import { cn } from '@/lib/utils';

/** The little animation shown while an answer is loading. Style comes from Settings → Loading animation. */
export function LoaderGraphic({ style, className }: { style: LoaderStyle; className?: string }) {
  switch (style) {
    case 'dots':
      return (
        <span className={cn('flex h-8 items-center gap-1.5', className)} aria-hidden>
          {[0, 1, 2].map((i) => <span key={i} className="ld-bob h-2 w-2 rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </span>
      );
    case 'orbit':
      return (
        <span className={cn('relative grid h-8 w-8 place-items-center', className)} aria-hidden>
          <span className="absolute inset-0.5 rounded-full border-2 border-primary/20" />
          <span className="ld-orbit absolute inset-0"><span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary" /></span>
          <span className="h-2 w-2 rounded-full bg-primary/60" />
        </span>
      );
    case 'sparkle':
      return (
        <span className={cn('grid h-8 w-8 place-items-center text-primary', className)} aria-hidden>
          <svg viewBox="0 0 24 24" className="ld-twinkle h-7 w-7" fill="currentColor"><path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5Z" /></svg>
        </span>
      );
    case 'wave':
      return (
        <span className={cn('flex h-8 items-center gap-1', className)} aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="ld-wave h-6 w-1 rounded-full bg-primary" style={{ animationDelay: `${i * 0.12}s` }} />)}
        </span>
      );
    case 'pulse':
      return (
        <span className={cn('relative grid h-8 w-8 place-items-center', className)} aria-hidden>
          <span className="ld-pulse absolute h-6 w-6 rounded-full bg-primary/40" />
          <span className="ld-pulse absolute h-6 w-6 rounded-full bg-primary/40" style={{ animationDelay: '.8s' }} />
          <span className="h-3 w-3 rounded-full bg-primary" />
        </span>
      );
    case 'logo':
    default:
      return (
        <span className={cn('ld-spin inline-grid h-8 w-8 place-items-center', className)} aria-hidden>
          <Image src="/spin.webp" alt="" aria-hidden width={56} height={56} unoptimized className="h-7 w-7 object-contain" />
        </span>
      );
  }
}

export function LoadingIndicator({ className }: { className?: string }) {
  const { appearance } = useAppearance();
  return (
    <div className={cn('flex items-center py-2', className)} role="status" aria-label="Loading answer">
      <LoaderGraphic style={appearance.loader ?? 'logo'} />
    </div>
  );
}
