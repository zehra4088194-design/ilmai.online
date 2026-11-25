import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authAppOrigin, safeAuthRedirect } from '@/lib/auth-redirect';

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const { searchParams } = requestUrl;
  const origin = authAppOrigin(requestUrl.origin);
  const next = safeAuthRedirect(searchParams.get('next'));
  const failure = next === '/reset-password'
    ? '/forgot-password?error=recovery'
    : `/login?error=auth&next=${encodeURIComponent(next)}`;
  let destination = failure;

  try {
    const code = searchParams.get('code');
    if (code && !searchParams.has('error')) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (user && !userError) destination = next;
      }
    }
  } catch {
    // Do not reflect provider errors, codes, tokens or verifier details in the URL/logs.
  }

  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
