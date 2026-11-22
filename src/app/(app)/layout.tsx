import { Wrench } from 'lucide-react';
import { requireUserPage } from '@/lib/auth';
import { featuresForUser } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { adminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/chat/AppShell';
import type { Appearance } from '@/components/providers';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin } = await requireUserPage();
  const db=adminClient();
  const [features, settings, bannerResult, creditResult] = await Promise.all([
    featuresForUser(profile.plan, isAdmin), getSettings(),
    adminClient().from('site_creatives').select('title,alt_text,storage_path')
      .eq('location','banner').eq('is_active',true).order('sort_order').limit(1).maybeSingle(),
    adminClient().rpc('get_credit_balances',{p_user:profile.id}),
  ]);
  if(creditResult.error) throw creditResult.error;
  const walletAvailable=Math.max(0,Number(creditResult.data?.walletBalance??0)-Number(creditResult.data?.walletReserved??0));
  const planAvailable=Math.max(0,Number(creditResult.data?.planBalance??0)-Number(creditResult.data?.planReserved??0));
  const availableCredits=walletAvailable+planAvailable;
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
      user={{ id: profile.id, name: profile.full_name ?? '', email: profile.email ?? '', plan: profile.plan, credits: availableCredits, isAdmin, appearance: (profile.preferences?.appearance as Partial<Appearance> | undefined) ?? null }}
      features={features}
      announcement={settings.announcement}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
