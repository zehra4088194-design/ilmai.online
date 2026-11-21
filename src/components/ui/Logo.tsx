import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      aria-hidden
      width={64}
      height={64}
      unoptimized
      className={cn('h-8 w-8 shrink-0 object-contain', className)}
    />
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Ilm AI home"
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
    >
      <LogoMark className="h-9 w-9" />
    </Link>
  );
}
