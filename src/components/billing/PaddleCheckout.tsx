'use client';

import { useRef } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    Paddle?: {
      Environment:{set:(environment:'sandbox')=>void};
      Initialize:(options:{token:string})=>void;
    };
  }
}

export function PaddleCheckout({token,environment}:{token:string;environment:string}) {
  const initialized=useRef(false);
  function initialize() {
    if(initialized.current||!token||!window.Paddle)return;
    if(environment==='sandbox')window.Paddle.Environment.set('sandbox');
    window.Paddle.Initialize({token});
    initialized.current=true;
  }

  if(!token)return <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Paddle checkout is not configured. Please return to the plans page or contact support.</p>;

  return <Script
    src="https://cdn.paddle.com/paddle/v2/paddle.js"
    strategy="afterInteractive"
    onReady={initialize}
  />;
}
