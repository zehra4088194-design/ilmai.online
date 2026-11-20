'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { z } from 'zod';
import { authCallbackPath, safeAuthRedirect } from '@/lib/auth-redirect';
import { Loader2, Mail, Lock, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui/Logo';

export function AuthForm({ mode, signupsEnabled = true }: { mode: 'login' | 'signup'; signupsEnabled?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeAuthRedirect(sp.get('next'));
  const reducedMotion = useReducedMotion();
  const inFlight = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [err, setErr] = useState<string | null>(sp.get('banned') ? 'Your account is suspended.' : sp.get('error') === 'confirmation' ? 'This confirmation link is invalid or expired. Try signing in or request a password reset.' : sp.get('error') ? 'Sign-in failed. Please try again.' : null);
  const [info, setInfo] = useState<string | null>(null);
  const isSignup = mode === 'signup';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || (isSignup && !signupsEnabled)) return;
    inFlight.current = true;
    setBusy('email'); setErr(null); setInfo(null);
    try {
      const parsedEmail = z.string().trim().email('Enter a valid email address.').parse(email);
      const supabase = createClient();
      if (isSignup) {
        const fullName = z.string().trim().min(1, 'Enter your name.').max(100, 'Use 100 characters or fewer for your name.')
          .regex(/[\p{L}\p{N}]/u, 'Enter your name.').parse(name);
        z.string().min(8, 'Use at least 8 characters for your password.').parse(password);
        const { data, error } = await supabase.auth.signUp({
          email: parsedEmail, password,
          options: { data: { full_name: fullName }, emailRedirectTo: `${location.origin}${authCallbackPath(next)}` },
        });
        if (error) throw error;
        if (!data.session) { setPassword(''); setInfo('Check your email for a confirmation link, then continue signing in.'); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: parsedEmail, password });
        if (error) throw error;
      }
      router.replace(next);
      router.refresh();
    } catch (e) {
      setErr(e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : 'Unable to sign in. Please try again.');
    } finally { inFlight.current = false; setBusy(null); }
  }

  async function google() {
    if (inFlight.current || (isSignup && !signupsEnabled)) return;
    inFlight.current = true;
    setBusy('google'); setErr(null); setInfo(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}${authCallbackPath(next)}`, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Google sign-in is unavailable. Please try again.');
      window.location.assign(data.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Google sign-in failed. Please try again.');
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reducedMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }} className="glass w-full max-w-md rounded-3xl p-7 shadow-soft sm:p-9">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-sm text-muted-foreground">{isSignup ? 'Free credits included – no card needed.' : 'Sign in to continue learning.'}</p>
        </div>

        {isSignup && !signupsEnabled ? (
          <p className="rounded-xl bg-muted p-4 text-center text-sm">New sign-ups are temporarily closed.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3.5" aria-busy={!!busy}>
            {isSignup && (
              <label className="relative block"><User className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Full name</span>
                <input className="input !pl-10" name="name" autoComplete="name" dir="auto" maxLength={100} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!busy} required />
              </label>
            )}
            <label className="relative block"><Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Email</span>
              <input className="input !pl-10" name="email" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!busy} required />
            </label>
            <label className="relative block"><Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Password</span>
              <input className="input !pl-10" name="password" type="password" placeholder={isSignup ? 'Password (min 8 characters)' : 'Password'} minLength={isSignup ? 8 : undefined} autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={!!busy} required />
            </label>
            {!isSignup && <div className="text-right text-sm"><Link href="/forgot-password" className="text-primary hover:underline">Forgot password?</Link></div>}
            {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
            {info && <p role="status" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{info}</p>}
            <button className="btn-primary w-full !py-3" disabled={!!busy}>{busy === 'email' && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{isSignup ? 'Create account' : 'Sign in'}</button>
            <div className="relative py-1 text-center text-xs text-muted-foreground"><span className="relative z-10 bg-card px-3">or</span><div className="absolute inset-x-0 top-1/2 h-px bg-border" /></div>
            <button type="button" onClick={google} className="btn-outline w-full !py-3" disabled={!!busy}>
              {busy === 'google' && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.61v3h3.86c2.26-2.08 3.58-5.15 3.58-8.8z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09z"/><path fill="#EA4335" d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76z"/></svg>
              Continue with Google
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignup ? 'Already have an account? ' : 'New to Ilm AI? '}
          <Link href={`${isSignup ? '/login' : '/signup'}?next=${encodeURIComponent(next)}`} className="font-semibold text-primary hover:underline">{isSignup ? 'Sign in' : 'Create one'}</Link>
        </p>
      </motion.div>
    </main>
  );
}
