import { MobileTopBar } from '@/components/chat/AppShell';
import { PlansTool } from '@/components/tools/PlansTool';
import { requireUserPage } from '@/lib/auth';

export const dynamic='force-dynamic';

export default async function Page(){
  await requireUserPage();
  return <>
    <MobileTopBar title="Plans & billing"/>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-6xl space-y-5 px-4 py-6"><PlansTool/></div></div>
  </>;
}
