'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Mail, Lock, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui/Logo';

export function AuthForm({ mode, signupsEnabled = true }: { mode: 'login' | 'signup'; signupsEnabled?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') ?? '/chat';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(sp.get('banned') ? 'Your account is suspended.' : sp.get('error') ? 'Sign-in failed. Please try again.' : null);
  const [info, setInfo] = useState<string | null>(null);
  const isSignup = mode === 'signup';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setInfo(null);
    const supabase = createClient();
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (!data.session) { setInfo('Check your email to confirm your account, then sign in.'); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(next);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setBusy(false); }
  }

  async function google() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 22, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="glass w-full max-w-md rounded-3xl p-7 shadow-soft sm:p-9">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-sm text-muted-foreground">{isSignup ? 'Free credits included – no card needed.' : 'Sign in to continue learning.'}</p>
        </div>

        {isSignup && !signupsEnabled ? (
          <p className="rounded-xl bg-muted p-4 text-center text-sm">New sign-ups are temporarily closed.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3.5">
            {isSignup && (
              <label className="relative block"><User className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                <input className="input !pl-10" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
            )}
            <label className="relative block"><Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <input className="input !pl-10" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="relative block"><Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <input className="input !pl-10" type="password" placeholder="Password (min 8 characters)" minLength={8} autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
            {info && <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{info}</p>}
            <button className="btn-primary w-full !py-3" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{isSignup ? 'Create account' : 'Sign in'}</button>
            <div className="relative py-1 text-center text-xs text-muted-foreground"><span className="relative z-10 bg-card px-3">or</span><div className="absolute inset-x-0 top-1/2 h-px bg-border" /></div>
            <button type="button" onClick={google} className="btn-outline w-full !py-3">
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.61v3h3.86c2.26-2.08 3.58-5.15 3.58-8.8z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09z"/><path fill="#EA4335" d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76z"/></svg>
              Continue with Google
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignup ? 'Already have an account? ' : 'New to Ilm AI? '}
          <Link href={isSignup ? '/login' : '/signup'} className="font-semibold text-primary hover:underline">{isSignup ? 'Sign in' : 'Create one'}</Link>
        </p>
      </motion.div>
    </main>
  );
}
