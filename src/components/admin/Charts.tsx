'use client';
import { useState } from 'react';

type Pt = { label: string; value: number };

/** Lightweight SVG charts (no chart library). */
function useHover(n: number) {
  const [i, setI] = useState<number | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setI(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  return { i, onMove, onLeave: () => setI(null) };
}

export function AreaChart({ data, format = (n: number) => String(n), height = 180 }: { data: Pt[]; format?: (n: number) => string; height?: number }) {
  const W = 640, H = height, P = { t: 14, r: 10, b: 22, l: 10 };
  const { i, onMove, onLeave } = useHover(data.length);
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (k: number) => P.l + (data.length <= 1 ? 0 : (k / (data.length - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const line = data.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const id = `ag-${Math.round(Math.random() * 1e6)}`;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={onMove} onMouseLeave={onLeave} role="img">
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="hsl(var(--primary))" stopOpacity=".35" /><stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="hsl(var(--border))" strokeDasharray="3 5" />)}
        {data.length > 0 && <><path d={area} fill={`url(#${id})`} /><path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /></>}
        {i !== null && data[i] && <><line x1={x(i)} x2={x(i)} y1={P.t} y2={H - P.b} stroke="hsl(var(--primary))" strokeOpacity=".4" /><circle cx={x(i)} cy={y(data[i].value)} r="4.5" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2.5" /></>}
        {data.length > 0 && [0, Math.floor((data.length - 1) / 2), data.length - 1].map((k) => <text key={k} x={x(k)} y={H - 6} fontSize="10" textAnchor={k === 0 ? 'start' : k === data.length - 1 ? 'end' : 'middle'} fill="hsl(var(--muted-foreground))">{data[k].label.slice(5)}</text>)}
      </svg>
      {i !== null && data[i] && <div className="pointer-events-none absolute right-2 top-0 rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background shadow">{data[i].label} · {format(data[i].value)}</div>}
    </div>
  );
}

export function BarChart({ data, format = (n: number) => String(n), height = 150 }: { data: Pt[]; format?: (n: number) => string; height?: number }) {
  const W = 640, H = height, P = { t: 10, b: 20 };
  const [i, setI] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = W / Math.max(1, data.length);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" onMouseLeave={() => setI(null)}>
        {data.map((d, k) => {
          const h = (d.value / max) * (H - P.t - P.b);
          return <rect key={k} x={k * bw + bw * 0.15} y={H - P.b - h} width={bw * 0.7} height={Math.max(h, d.value ? 2 : 0)} rx={Math.min(5, bw * 0.3)}
            fill="hsl(var(--primary))" fillOpacity={i === null || i === k ? 0.9 : 0.35} onMouseEnter={() => setI(k)} />;
        })}
        {data.length > 0 && [0, data.length - 1].map((k) => <text key={k} x={k === 0 ? 0 : W} y={H - 5} fontSize="10" textAnchor={k === 0 ? 'start' : 'end'} fill="hsl(var(--muted-foreground))">{data[k].label.slice(5)}</text>)}
      </svg>
      {i !== null && data[i] && <div className="pointer-events-none absolute right-2 top-0 rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background shadow">{data[i].label} · {format(data[i].value)}</div>}
    </div>
  );
}

export function BarList({ rows, format = (n: number) => String(n) }: { rows: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data yet</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium">{r.label}</span><span className="shrink-0 text-xs text-muted-foreground">{r.sub ? `${r.sub} · ` : ''}<b className="text-foreground">{format(r.value)}</b></span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-[hsl(var(--blob-2))]" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
