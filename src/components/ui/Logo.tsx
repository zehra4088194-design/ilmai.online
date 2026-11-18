import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--blob-2))" />
          <stop offset="1" stopColor="hsl(var(--primary))" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path d="M32 14c-9 6-13 14-13 22 0 7 5 12 13 14 8-2 13-7 13-14 0-8-4-16-13-22z" fill="#fff" opacity=".95" />
      <path d="M32 24v26M32 36l-7-6M32 42l8-7" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 font-extrabold tracking-tight', className)}>
      <LogoMark />
      <span className="text-lg">Ilm <span className="text-gradient">AI</span></span>
    </Link>
  );
}
