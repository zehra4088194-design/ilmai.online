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
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    shortcut: '/icon.png',
    apple: [{ url: '/icon.png', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f3faf5' }, { media: '(prefers-color-scheme: dark)', color: '#07110c' }],
};

const appearanceBoot = `try{const r=document.documentElement;const p=JSON.parse(localStorage.getItem('ilm-appearance')||'{}');const mode=p.mode||'dark';r.classList.toggle('dark',mode==='dark'||(mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));r.dataset.themeFamily=p.family||'classic';r.dataset.headingStyle=p.headingStyle||'auto';r.dataset.fontStyle=p.font||'sans';r.dataset.monochrome=p.monochrome?'true':'false';const c=(p.monochrome?'#a1a1aa':(p.accent||'#22c55e')).replace('#','');let R=parseInt(c.slice(0,2),16)/255,G=parseInt(c.slice(2,4),16)/255,B=parseInt(c.slice(4,6),16)/255;let M=Math.max(R,G,B),m=Math.min(R,G,B),d=M-m,h=0,l=(M+m)/2,ss=0;if(d){ss=d/(1-Math.abs(2*l-1));if(M===R)h=((G-B)/d)%6;else if(M===G)h=(B-R)/d+2;else h=(R-G)/d+4;h*=60;if(h<0)h+=360;}r.style.setProperty('--custom-primary',Math.round(h)+' '+Math.round(ss*100)+'% '+Math.round(l*100)+'%');r.dataset.accent='custom';r.style.setProperty('--heading-color',p.headingColor==='auto'?'hsl(var(--primary))':(p.headingColor||'hsl(var(--primary))'));}catch(e){document.documentElement.classList.add('dark')}`;

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
