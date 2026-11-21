import { MobileTopBar } from '@/components/chat/AppShell';
import { ProjectDetailTool } from '@/components/tools/ProjectDetailTool';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUserPage();
  const { id } = await params;
  return (
    <>
      <MobileTopBar title="Project" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6"><ProjectDetailTool projectId={id} /></div>
      </div>
    </>
  );
}
