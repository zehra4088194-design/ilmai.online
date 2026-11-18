import { redirect } from 'next/navigation';
import { requireUserPage } from '@/lib/auth';
import { getFeatureFlags, stateFor } from '@/lib/features';
import { CompareView } from '@/components/chat/CompareView';

export const metadata = { title: 'Compare models' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { profile, isAdmin } = await requireUserPage();
  const f = (await getFeatureFlags()).find((x) => x.key === 'compare_models');
  if (!f || stateFor(f, profile.plan, isAdmin) !== 'active') redirect('/chat');
  return <CompareView />;
}
