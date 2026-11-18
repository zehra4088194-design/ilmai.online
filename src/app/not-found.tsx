import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="glass max-w-md rounded-3xl p-10">
        <div className="mb-4 flex justify-center"><Logo /></div>
        <p className="text-6xl font-extrabold text-gradient">404</p>
        <p className="mt-2 text-muted-foreground">This page wandered off. Let&apos;s get you back.</p>
        <Link href="/chat" className="btn-primary mt-6">Go to chat</Link>
      </div>
    </main>
  );
}
