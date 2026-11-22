import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  const sizeClass = cn('h-8 w-8 shrink-0 object-contain', className);

  return (
    <>
      <Image
        src="/brand/ilm-ai-light.webp"
        alt=""
        aria-hidden
        width={64}
        height={64}
        unoptimized
        className={cn(sizeClass, 'dark:hidden')}
      />
      <Image
        src="/icon.webp"
        alt=""
        aria-hidden
        width={64}
        height={64}
        unoptimized
        className={cn(sizeClass, 'hidden dark:block')}
      />
    </>
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
