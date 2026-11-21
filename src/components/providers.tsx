'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

/* ---------- accent palette ---------- */
export const ACCENTS = [
  { id: 'emerald', label: 'Emerald', swatch: '#1f9d63' },
  { id: 'mint', label: 'Mint', swatch: '#2aa58a' },
  { id: 'forest', label: 'Forest', swatch: '#2f7a45' },
  { id: 'teal', label: 'Teal', swatch: '#1b9488' },
  { id: 'lime', label: 'Lime', swatch: '#6aa629' },
] as const;

const AccentCtx = createContext<{ accent: string; setAccent: (a: string) => void }>({ accent: 'emerald', setAccent: () => {} });
export const useAccent = () => useContext(AccentCtx);

function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, set] = useState('emerald');
  useEffect(() => {
    const a = localStorage.getItem('ilm-accent');
    if (a) set(a);
  }, []);
  const setAccent = (a: string) => {
    set(a);
    document.documentElement.dataset.accent = a;
    try { localStorage.setItem('ilm-accent', a); } catch { /* private mode */ }
  };
  return <AccentCtx.Provider value={{ accent, setAccent }}>{children}</AccentCtx.Provider>;
}

/* ---------- toasts ---------- */
type Toast = { id: number; msg: string; type: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(msg: string, type?: Toast['type']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, msg, type }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  const Icon = { ok: CheckCircle2, err: AlertCircle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
        <AnimatePresence>
          {list.map((t) => {
            const I = Icon[t.type];
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
                className="glass pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-soft">
                <I className={`mt-0.5 h-4 w-4 shrink-0 ${t.type === 'err' ? 'text-danger' : 'text-primary'}`} />
                <span>{t.msg}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
      <AccentProvider><ToastProvider>{children}</ToastProvider></AccentProvider>
    </ThemeProvider>
  );
}
