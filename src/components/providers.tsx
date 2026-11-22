'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export type Appearance = {
  family: string;
  mode: 'dark' | 'light' | 'system';
  accent: string;
  monochrome: boolean;
  headingColor: string;
  headingStyle: 'auto' | 'handwritten' | 'serif' | 'minimal';
  font: 'sans' | 'serif' | 'mono';
  loader: LoaderStyle;
};
export type LoaderStyle = 'logo' | 'dots' | 'orbit' | 'sparkle' | 'wave' | 'pulse';
export const LOADERS: { id: LoaderStyle; label: string }[] = [
  { id: 'logo', label: 'Ilm logo spin' },
  { id: 'dots', label: 'Bouncing dots' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'wave', label: 'Sound wave' },
  { id: 'pulse', label: 'Soft pulse' },
];
/** 'neutral' = black in light mode, white in dark mode (the default, no colour). */
export const NEUTRAL_ACCENT = 'neutral';
export const DEFAULT_APPEARANCE: Appearance = {
  family: 'classic', mode: 'system', accent: NEUTRAL_ACCENT, monochrome: false,
  headingColor: 'auto', headingStyle: 'auto', font: 'sans', loader: 'logo',
};
export const THEME_FAMILIES = [
  { id: 'classic', label: 'Ilm Mono', swatches: ['#0a0a0a','#f5f5f5','#171717'] },
  { id: 'violet', label: 'Violet Focus', swatches: ['#100c1b','#a78bfa','#211831'] },
  { id: 'rose', label: 'Rose Focus', swatches: ['#170d12','#f472b6','#2a1721'] },
  { id: 'blue', label: 'Blue Night', swatches: ['#0a101a','#60a5fa','#172336'] },
  { id: 'paper', label: 'Paper Notes', swatches: ['#f5f0e5','#2563eb','#e7dfcd'] },
  { id: 'midnight', label: 'Midnight Grain', swatches: ['#101010','#f59e0b','#242424'] },
  { id: 'forest', label: 'Forest Study', swatches: ['#0d1711','#4ade80','#1a2c20'] },
  { id: 'sunset', label: 'Sunset Atelier', swatches: ['#19100b','#fb923c','#2a1c13'] },
  { id: 'copper', label: 'Copper Lab', swatches: ['#17120e','#d97706','#2b2119'] },
  { id: 'ice', label: 'Ice Glass', swatches: ['#08131c','#22d3ee','#142633'] },
] as const;
export const ACCENTS = [
  { id: 'neutral', label: 'Black / White', swatch: '#171717' },
  { id: '#22c55e', label: 'Green', swatch: '#22c55e' },
  { id: '#a78bfa', label: 'Violet', swatch: '#a78bfa' },
  { id: '#f472b6', label: 'Pink', swatch: '#f472b6' },
  { id: '#60a5fa', label: 'Blue', swatch: '#60a5fa' },
  { id: '#f59e0b', label: 'Amber', swatch: '#f59e0b' },
  { id: '#22d3ee', label: 'Cyan', swatch: '#22d3ee' },
  { id: '#fb7185', label: 'Coral', swatch: '#fb7185' },
  { id: '#a3e635', label: 'Lime', swatch: '#a3e635' },
  { id: '#a1a1aa', label: 'Monochrome', swatch: '#a1a1aa' },
] as const;

type AppearanceContextValue = { appearance: Appearance; updateAppearance: (patch: Partial<Appearance>) => void; loaded: boolean };
const AppearanceCtx = createContext<AppearanceContextValue>({ appearance: DEFAULT_APPEARANCE, updateAppearance: () => {}, loaded: false });
export const useAppearance = () => useContext(AppearanceCtx);
const AccentCtx = createContext<{ accent: string; setAccent: (a: string) => void }>({ accent: '#22c55e', setAccent: () => {} });
export const useAccent = () => useContext(AccentCtx);

function hexToHsl(hex: string) {
  const clean = hex.replace('#','');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '142 71% 45%';
  let r=parseInt(clean.slice(0,2),16)/255,g=parseInt(clean.slice(2,4),16)/255,b=parseInt(clean.slice(4,6),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min; let h=0,s=0,l=(max+min)/2;
  if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;if(h<0)h+=360;}
  return `${Math.round(h)} ${Math.round(s*100)}% ${Math.round(l*100)}%`;
}
function AppearanceRuntime({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const [appearance,setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [loaded,setLoaded] = useState(false);
  const [persistReady,setPersistReady] = useState(false);
  useEffect(() => {
    try {
      const stored=localStorage.getItem('ilm-appearance');
      if(stored){
        const parsed=JSON.parse(stored);
        // v2: the old default accent (green) becomes the new neutral black/white default, once.
        if(!localStorage.getItem('ilm-appearance-v2')){
          if(parsed?.accent==='#22c55e'&&!parsed?.monochrome) parsed.accent=NEUTRAL_ACCENT;
          localStorage.setItem('ilm-appearance-v2','1');
        }
        setAppearance({...DEFAULT_APPEARANCE,...parsed});setPersistReady(true);
      }
    } catch { /* local storage can be unavailable */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if(!loaded) return;
    const root=document.documentElement;
    root.dataset.themeFamily=appearance.family;
    root.dataset.headingStyle=appearance.headingStyle;
    root.dataset.fontStyle=appearance.font;
    root.dataset.monochrome=appearance.monochrome?'true':'false';
    const neutral=!appearance.monochrome&&!/^#[0-9a-fA-F]{6}$/.test(appearance.accent);
    root.dataset.accentMode=neutral?'neutral':'color';
    if(neutral) root.style.removeProperty('--custom-primary');
    else root.style.setProperty('--custom-primary',hexToHsl(appearance.monochrome?'#a1a1aa':appearance.accent));
    root.style.setProperty('--heading-color',appearance.headingColor==='auto'?'hsl(var(--primary))':appearance.headingColor);
    setTheme(appearance.mode);
    try{if(persistReady){localStorage.setItem('ilm-appearance',JSON.stringify(appearance));localStorage.setItem('ilm-accent',appearance.accent);localStorage.setItem('ilm-appearance-v2','1');}}catch{/* storage optional */}
  },[appearance,loaded,persistReady,setTheme]);
  const updateAppearance=useCallback((patch:Partial<Appearance>)=>{setPersistReady(true);setAppearance(p=>({...p,...patch}));},[]);
  return <AppearanceCtx.Provider value={{appearance,updateAppearance,loaded}}><AccentCtx.Provider value={{accent:appearance.accent,setAccent:(accent)=>updateAppearance({accent})}}>{children}</AccentCtx.Provider></AppearanceCtx.Provider>;
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
  return <ToastCtx.Provider value={push}>{children}<div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"><AnimatePresence>{list.map((t) => {const I=Icon[t.type];return <motion.div key={t.id} layout initial={{opacity:0,y:16,scale:0.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,x:40}} className="glass pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-soft"><I className={`mt-0.5 h-4 w-4 shrink-0 ${t.type==='err'?'text-danger':'text-primary'}`} /><span>{t.msg}</span></motion.div>;})}</AnimatePresence></div></ToastCtx.Provider>;
}
export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange><AppearanceRuntime><ToastProvider>{children}</ToastProvider></AppearanceRuntime></ThemeProvider>;
}
