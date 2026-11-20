import { adminClient } from '@/lib/supabase/admin';
import { PageHead } from '@/components/admin/AdminShell';
import { ModesAdmin, type AdminMode } from '@/components/admin/ModesAdmin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data } = await adminClient().from('modes').select('*').order('sort_order');
  return (
    <>
      <PageHead title="Study modes" sub="The Student / Teacher “plugins” shown in the sidebar. Each mode = a name, hidden AI instructions, starter prompts and an optional tool (e.g. the quiz builder)." />
      <ModesAdmin initial={(data ?? []) as AdminMode[]} />
    </>
  );
}
