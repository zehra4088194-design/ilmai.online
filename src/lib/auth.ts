import 'server-only';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';

export type Plan = 'free' | 'pro' | 'elite';
export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  plan: Plan;
  credits_balance: number;
  is_banned: boolean;
  preferred_model: string | null;
  language: string;
  audience: 'student' | 'teacher';
  grade: string | null;
  created_at: string;
};

export const isAdminProfile = (p: Pick<Profile, 'role' | 'email'>) =>
  p.role === 'admin' || (!!p.email && env.adminEmails.includes(p.email.toLowerCase()));

/** Returns the signed-in user + profile, or null. */
export async function getAuth(): Promise<{ user: User; profile: Profile; isAdmin: boolean } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = adminClient();
  let { data: profile } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) {
    // trigger may not have run (e.g. user existed before migration) – create lazily
    const ins = await db
      .from('profiles')
      .insert({ id: user.id, email: user.email, full_name: user.user_metadata?.full_name ?? null, credits_balance: 500 })
      .select('*')
      .single();
    profile = ins.data;
  }
  if (!profile) return null;
  return { user, profile: profile as Profile, isAdmin: isAdminProfile(profile as Profile) };
}

/** For pages / layouts: redirects to /login when signed out. */
export async function requireUserPage() {
  const a = await getAuth();
  if (!a) redirect('/login');
  if (a.profile.is_banned) redirect('/login?banned=1');
  return a;
}

export async function requireAdminPage() {
  const a = await requireUserPage();
  if (!a.isAdmin) redirect('/chat');
  return a;
}

/** For API routes: throws HttpError. */
export async function requireUserApi() {
  const a = await getAuth();
  if (!a) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  if (a.profile.is_banned) throw new HttpError(403, 'Your account is suspended', 'banned');
  return a;
}

export async function requireAdminApi() {
  const a = await requireUserApi();
  if (!a.isAdmin) throw new HttpError(403, 'Admins only', 'forbidden');
  return a;
}
