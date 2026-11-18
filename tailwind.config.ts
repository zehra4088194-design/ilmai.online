import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const c = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: c('background'),
        foreground: c('foreground'),
        card: c('card'),
        'card-foreground': c('card-foreground'),
        muted: c('muted'),
        'muted-foreground': c('muted-foreground'),
        border: c('border'),
        input: c('input'),
        ring: c('ring'),
        primary: c('primary'),
        'primary-foreground': c('primary-foreground'),
        accent: c('accent'),
        'accent-foreground': c('accent-foreground'),
        danger: c('danger'),
        warning: c('warning'),
        success: c('success'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', '"Noto Nastaliq Urdu Variable"', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu Variable"', 'serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl: '1rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        soft: '0 8px 30px -12px hsl(var(--primary) / 0.25)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.25), 0 10px 40px -10px hsl(var(--primary) / 0.45)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' }, '50%': { transform: 'translate3d(30px,-40px,0) scale(1.08)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        blink: { '50%': { opacity: '0' } },
      },
      animation: { float: 'float 18s ease-in-out infinite', blink: 'blink 1s steps(2) infinite' },
    },
  },
  plugins: [typography],
};
export default config;
