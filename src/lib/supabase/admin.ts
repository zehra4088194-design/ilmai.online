import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from '@/lib/http';

/** Service-role client – bypasses RLS. Server only. Always verify the caller (requireAdmin / requireUser) first. */
export const adminClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new HttpError(503, 'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)', 'not_configured');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
