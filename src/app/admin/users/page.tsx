import { adminClient } from '@/lib/supabase/admin';
import { PageHead } from '@/components/admin/AdminShell';
import { UsersAdmin, type AdminUser } from '@/components/admin/UsersAdmin';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim().replace(/[%,()]/g, '');
  let query = adminClient().from('profiles').select('id,email,full_name,role,plan,credits_balance,is_banned,created_at').order('created_at', { ascending: false }).limit(200);
  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  const { data } = await query;
  return (
    <>
      <PageHead title="Users & credits" sub="Change plans and roles, grant credits, suspend accounts.">
        <form className="flex gap-2"><input name="q" defaultValue={q} className="input !w-64" placeholder="Search name or email…" /><button className="btn-primary">Search</button></form>
      </PageHead>
      <UsersAdmin key={q} initial={(data ?? []) as AdminUser[]} />
    </>
  );
}
