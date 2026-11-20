import { Suspense } from 'react';
import { PasswordForm } from '@/components/PasswordForm';

export const metadata = { title: 'Forgot password', robots: { index: false } };

export default function Page() {
  return <Suspense><PasswordForm mode="request" /></Suspense>;
}
