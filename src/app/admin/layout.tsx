import { requireAdminPage } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminPage();
  return <AdminShell email={profile.email ?? ''}>{children}</AdminShell>;
}
