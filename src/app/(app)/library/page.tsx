import { Suspense } from 'react';
import { MobileTopBar } from '@/components/chat/AppShell';
import { LibraryTool } from '@/components/tools/LibraryTool';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  await requireUserPage();
  return (
    <>
      <MobileTopBar title="Library" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Suspense fallback={<div className="card p-8 text-center text-sm text-muted-foreground">Loading Library…</div>}>
            <LibraryTool />
          </Suspense>
        </div>
      </div>
    </>
  );
}
