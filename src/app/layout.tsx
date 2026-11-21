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

const accentBoot = `try{document.documentElement.classList.add('dark');document.documentElement.dataset.accent='emerald'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: accentBoot }} /></head>
      <body>
        <div className="aurora" aria-hidden><i /></div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
