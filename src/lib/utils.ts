import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fmtNum = (n: number | null | undefined) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0);

export const fmtUsd = (n: number | null | undefined) =>
  `$${(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export const isUrdu = (s: string) => /[\u0600-\u06FF]/.test(s);
