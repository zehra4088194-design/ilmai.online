import { notFound } from 'next/navigation';
import { MobileTopBar } from '@/components/chat/AppShell';
import { TestStudioTool } from '@/components/tools/TestStudioTool';
import { requireUserPage } from '@/lib/auth';
import { getFeatureFlags, stateFor } from '@/lib/features';

export const dynamic = 'force-dynamic';

export default async function TestStudioPage() {
  const { profile, isAdmin } = await requireUserPage();
  const feature = (await getFeatureFlags()).find((item) => item.key === 'teacher_tests');
  if (!feature) notFound();
  const state = stateFor(feature, profile.plan, isAdmin);
  return (
    <>
      <MobileTopBar title="Test Studio" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {state === 'active' ? <TestStudioTool /> : (
            <div className="glass rounded-3xl p-8 text-center">
              <h1 className="text-xl font-bold">{state === 'locked_plan' ? 'Upgrade required' : 'Test Studio is not available yet'}</h1>
              <p className="mt-2 text-sm text-muted-foreground">This feature is currently controlled by the Ilm AI administrator.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
