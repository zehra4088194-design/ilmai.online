import { notFound } from 'next/navigation';
import { Lock, Hourglass } from 'lucide-react';
import { requireUserPage } from '@/lib/auth';
import { getFeatureFlags, stateFor } from '@/lib/features';
import { iconFor } from '@/components/icons';
import { MobileTopBar } from '@/components/chat/AppShell';
import { ImageTool } from '@/components/tools/ImageTool';
import { PresentationTool } from '@/components/tools/PresentationTool';
import { TestStudioTool } from '@/components/tools/TestStudioTool';

export const dynamic = 'force-dynamic';

export default async function ToolPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { profile, isAdmin } = await requireUserPage();
  const f = (await getFeatureFlags()).find((x) => x.key === key);
  if (!f || ['text_chat', 'compare_models'].includes(key)) notFound();
  const state = stateFor(f, profile.plan, isAdmin);
  if (state === 'hidden') notFound();
  const Icon = iconFor(f.icon);

  return (
    <>
      <MobileTopBar title={f.label} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="mb-7 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary shadow-soft"><Icon className="h-7 w-7" /></div>
            <div><h1 className="text-2xl font-extrabold tracking-tight">{f.label}</h1><p className="text-sm text-muted-foreground">{f.description}</p></div>
          </div>

          {state !== 'active' ? (
            <div className="glass rounded-3xl p-10 text-center">
              {state === 'locked_plan' ? <Lock className="mx-auto mb-3 h-9 w-9 text-primary" /> : <Hourglass className="mx-auto mb-3 h-9 w-9 text-primary" />}
              <h2 className="text-xl font-bold">{state === 'locked_plan' ? `Available on the ${f.min_plan} plan` : 'Coming soon'}</h2>
              <p className="mt-1 text-muted-foreground">{state === 'locked_plan' ? 'Upgrade your plan to unlock this tool.' : 'We are polishing this feature. It will appear here very soon.'}</p>
            </div>
          ) : key === 'image_generation' ? <ImageTool />
            : key === 'presentations' ? <PresentationTool />
            : key === 'teacher_tests' ? <TestStudioTool />
            : (
              <div className="glass rounded-3xl p-10 text-center">
                <Hourglass className="mx-auto mb-3 h-9 w-9 text-primary" />
                <h2 className="text-xl font-bold">Backend is ready, UI is next</h2>
                <p className="mt-1 text-muted-foreground">This feature is enabled by the admin, but its screen has not been built yet (see docs/ROADMAP.md).</p>
              </div>
            )}
        </div>
      </div>
    </>
  );
}
