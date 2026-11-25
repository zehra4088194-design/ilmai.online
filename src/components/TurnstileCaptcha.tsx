'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type TurnstileWidgetId = string;

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  theme?: 'auto' | 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId;
      reset: (widgetId: TurnstileWidgetId) => void;
      remove: (widgetId: TurnstileWidgetId) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export const isTurnstileEnabled = SITE_KEY.length > 0;

export function TurnstileCaptcha({
  action,
  onToken,
  resetNonce,
}: {
  action: 'signup' | 'login' | 'password_reset';
  onToken: (token: string) => void;
  resetNonce: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const onTokenRef = useRef(onToken);
  const previousResetRef = useRef(resetNonce);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !window.turnstile || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      action,
      theme: 'auto',
      callback: (token) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(''),
      'error-callback': () => onTokenRef.current(''),
    });

    return () => {
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [action, scriptReady]);

  useEffect(() => {
    if (previousResetRef.current === resetNonce) return;
    previousResetRef.current = resetNonce;
    onTokenRef.current('');
    const widgetId = widgetIdRef.current;
    if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
  }, [resetNonce]);

  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => onTokenRef.current('')}
      />
      <div ref={containerRef} className="min-h-[65px]" aria-label="Security verification" />
      <p className="mt-1 text-[11px] text-muted-foreground">Protected by Cloudflare Turnstile</p>
    </div>
  );
}
