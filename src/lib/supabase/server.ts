import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { HttpError } from '@/lib/http';

/**
 * Native clients keep their Supabase session in the device's secure storage and send
 * the access token as a bearer header. Web clients continue to authenticate with cookies.
 */
export async function getBearerToken(): Promise<string | null> {
  const authorization = (await headers()).get('authorization')?.trim() ?? '';
  const match = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

/** Supabase client bound to the current user's session (RLS applies). */
export async function createClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    throw new HttpError(503, 'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)', 'not_configured');
  const store = await cookies();
  const bearer = await getBearerToken();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...(bearer ? { global: { headers: { Authorization: `Bearer ${bearer}` } } } : {}),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component – middleware refreshes the session instead */
        }
      },
    },
  });
}
