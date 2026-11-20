import { Wrench } from 'lucide-react';
import { requireUserPage } from '@/lib/auth';
import { featuresForUser } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { getModes } from '@/lib/modes';
import { AppShell } from '@/components/chat/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin } = await requireUserPage();
  const [features, settings, modes, bannerResult] = await Promise.all([
    featuresForUser(profile.plan, isAdmin), getSettings(), getModes(),
    adminClient().from('site_creatives').select('title,alt_text,storage_path')
      .eq('location','banner').eq('is_active',true).order('sort_order').limit(1).maybeSingle(),
  ]);
  const banner = bannerResult.data ? {
    title: bannerResult.data.title,
    altText: bannerResult.data.alt_text,
    url: adminClient().storage.from('site-banners').getPublicUrl(bannerResult.data.storage_path).data.publicUrl,
  } : null;

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
      user={{ id: profile.id, name: profile.full_name ?? '', email: profile.email ?? '', plan: profile.plan, credits: profile.credits_balance, isAdmin, audience: profile.audience ?? 'student' }}
      features={features}
      modes={modes}
      announcement={settings.announcement}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
