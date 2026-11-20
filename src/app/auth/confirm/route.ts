import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOtpType, safeAuthRedirect } from '@/lib/auth-redirect';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const type = searchParams.get('type');
  // Recovery must always land on the password screen, regardless of supplied `next`.
  const next = type === 'recovery' ? '/reset-password' : safeAuthRedirect(searchParams.get('next'));
  let destination = type === 'recovery' ? '/forgot-password?error=recovery' : '/login?error=confirmation';

  try {
    const token_hash = searchParams.get('token_hash');
    if (token_hash && isAllowedOtpType(type) && !searchParams.has('error')) {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (!error) {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (user && !userError) destination = next;
      }
    }
  } catch {
    // An invalid, expired or already-used link gets a generic, token-free error destination.
  }

  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
