import { adminClient } from '@/lib/supabase/admin';
import { PageHead } from '@/components/admin/AdminShell';
import { SkillsAdmin, type Skill } from '@/components/admin/SkillsAdmin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data } = await adminClient().from('skills').select('*').order('sort_order');
  return (
    <>
      <PageHead title="Teacher skills" sub="Templates for the test-paper maker. Teachers pick a template; the hidden instructions, schema and PDF design stay in the background." />
      <SkillsAdmin initial={(data ?? []) as Skill[]} />
    </>
  );
}
