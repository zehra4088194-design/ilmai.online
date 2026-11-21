import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/noto-nastaliq-urdu';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: { default: 'Ilm AI – every AI model, one beautiful place', template: '%s · Ilm AI' },
  description: 'Chat with every top AI model in one place. Built for students and teachers.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f3faf5' }, { media: '(prefers-color-scheme: dark)', color: '#07110c' }],
};

const appearanceBoot = `try{const r=document.documentElement;const p=JSON.parse(localStorage.getItem('ilm-appearance')||'{}');const mode=p.mode||'dark';r.classList.toggle('dark',mode==='dark'||(mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));r.dataset.themeFamily=p.family||'classic';r.dataset.headingStyle=p.headingStyle||'auto';r.dataset.fontStyle=p.font||'sans';r.dataset.monochrome=p.monochrome?'true':'false';r.style.setProperty('--custom-primary',p.monochrome?'0 0% 62%':(p.accent||'#22c55e'));r.dataset.accent='custom';r.style.setProperty('--heading-color',p.headingColor==='auto'?'hsl(var(--primary))':(p.headingColor||'hsl(var(--primary))'));}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: appearanceBoot }} /></head>
      <body>
        <div className="aurora" aria-hidden><i /></div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
