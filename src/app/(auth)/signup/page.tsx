import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { getSettings } from '@/lib/settings';
export const metadata = { title: 'Create account' };
export const dynamic = 'force-dynamic';
export default async function Page() {
  const s = await getSettings();
  return <Suspense><AuthForm mode="signup" signupsEnabled={s.signups_enabled} /></Suspense>;
}
