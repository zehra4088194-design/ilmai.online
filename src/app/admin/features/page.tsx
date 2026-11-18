import { adminClient } from '@/lib/supabase/admin';
import { PageHead } from '@/components/admin/AdminShell';
import { FeaturesAdmin, type Flag } from '@/components/admin/FeaturesAdmin';

export default async function Page() {
  const { data } = await adminClient().from('feature_flags').select('*').order('sort_order');
  return (
    <>
      <PageHead title="Features" sub="Decide what each user sees. Enabled = the API works · Visible = shown in the app · Coming soon = shown but locked. Admins can always test everything." />
      <FeaturesAdmin initial={(data ?? []) as Flag[]} />
    </>
  );
}
