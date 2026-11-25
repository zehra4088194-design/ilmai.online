'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui/Logo';
import { authCallbackPath } from '@/lib/auth-redirect';
import { isTurnstileEnabled, TurnstileCaptcha } from '@/components/TurnstileCaptcha';

export function PasswordForm({ mode }: { mode: 'request' | 'update' }) {
  const isRequest = mode === 'request';
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();
  const inFlight = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.has('error') ? 'Your reset link is invalid or expired. Request a new one below.' : null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetNonce, setCaptchaResetNonce] = useState(0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || done) return;
    if (isRequest && isTurnstileEnabled && !captchaToken) {
      setError('Please complete the security check first.');
      return;
    }
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      if (isRequest) {
        const address = z.string().trim().email('Enter a valid email address.').parse(email);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: `${location.origin}${authCallbackPath('/reset-password')}`,
          ...(isTurnstileEnabled ? { captchaToken } : {}),
        });
        if (resetError) throw new Error('Unable to send a reset link right now. Please try again later.');
      } else {
        z.string().min(8, 'Use at least 8 characters for your password.').parse(password);
        if (password !== confirmation) throw new Error('Passwords do not match.');
        // Revalidate before mutation too: the session may have expired since SSR rendered the page.
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw new Error('Your session expired. Request a new reset link.');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword(''); setConfirmation('');
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (isRequest && isTurnstileEnabled) {
        setCaptchaToken('');
        setCaptchaResetNonce((value) => value + 1);
      }
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.3 }} className="glass w-full max-w-md rounded-3xl p-7 shadow-soft sm:p-9">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="mt-3 text-2xl font-extrabold">{isRequest ? 'Forgot your password?' : 'Choose a new password'}</h1>
          <p className="text-sm text-muted-foreground">{isRequest ? 'We will email you a secure reset link.' : 'Use at least 8 characters.'}</p>
        </div>
        {done ? (
          <div role="status" className="space-y-4 text-center text-sm">
            <p>{isRequest ? 'If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.' : 'Your password has been updated.'}</p>
            <Link className="btn-primary w-full" href={isRequest ? '/login' : '/chat'}>{isRequest ? 'Back to sign in' : 'Continue to chat'}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
            {isRequest ? (
              <label className="block space-y-1 text-sm font-medium">Email
                <input className="input" type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
              </label>
            ) : (
              <>
                <label className="block space-y-1 text-sm font-medium">New password
                  <input className="input" type="password" name="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
                </label>
                <label className="block space-y-1 text-sm font-medium">Confirm new password
                  <input className="input" type="password" name="confirmation" autoComplete="new-password" minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required disabled={busy} />
                </label>
              </>
            )}
            {isRequest && isTurnstileEnabled && <TurnstileCaptcha action="password_reset" onToken={setCaptchaToken} resetNonce={captchaResetNonce} />}
            {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <button className="btn-primary w-full !py-3" disabled={busy || (isRequest && isTurnstileEnabled && !captchaToken)}>
              {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              {isRequest ? 'Send reset link' : 'Update password'}
            </button>
            <p className="text-center text-sm"><Link className="text-primary hover:underline" href={isRequest ? '/login' : '/forgot-password'}>{isRequest ? 'Back to sign in' : 'Request a new reset link'}</Link></p>
          </form>
        )}
      </motion.div>
    </main>
  );
}
