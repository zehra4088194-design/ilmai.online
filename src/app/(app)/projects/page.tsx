import { MobileTopBar } from '@/components/chat/AppShell';
import { ProjectsTool } from '@/components/tools/ProjectsTool';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  await requireUserPage();
  return (
    <>
      <MobileTopBar title="Projects" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6"><ProjectsTool /></div>
      </div>
    </>
  );
}
