import { getSettings } from '@/lib/settings';
import { PageHead } from '@/components/admin/AdminShell';
import { SettingsAdmin } from '@/components/admin/SettingsAdmin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  return (
    <>
      <PageHead title="Settings" sub="Global switches, credit economy and the AI's system prompt." />
      <SettingsAdmin initial={await getSettings()} />
    </>
  );
}
