import { Wrench } from 'lucide-react';
import { requireUserPage } from '@/lib/auth';
import { featuresForUser } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { AppShell } from '@/components/chat/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin } = await requireUserPage();
  const [features, settings] = await Promise.all([featuresForUser(profile.plan, isAdmin), getSettings()]);

  if (settings.maintenance_mode && !isAdmin) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="glass max-w-md rounded-3xl p-10">
          <Wrench className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-extrabold">We&apos;ll be right back</h1>
          <p className="mt-2 text-muted-foreground">Ilm AI is getting an upgrade. Please try again in a little while.</p>
        </div>
      </main>
    );
  }

  return (
    <AppShell
      user={{ name: profile.full_name ?? '', email: profile.email ?? '', plan: profile.plan, credits: profile.credits_balance, isAdmin }}
      features={features}
      announcement={settings.announcement}
    >
      {children}
    </AppShell>
  );
}
