import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { PasswordForm } from '@/components/PasswordForm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Reset password', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/forgot-password?error=recovery');
  return <Suspense><PasswordForm mode="update" /></Suspense>;
}
