import { adminClient } from '@/lib/supabase/admin';
import { storageConfigured } from '@/lib/storage/b2';
import { PageHead } from '@/components/admin/AdminShell';
import { MediaAdmin, type AdminMedia } from '@/components/admin/MediaAdmin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data } = await adminClient().from('media_assets').select('id,kind,mime,size_bytes,prompt,model,created_at,status,profiles(email)').order('created_at', { ascending: false }).limit(60);
  type R = Omit<AdminMedia, 'email'> & { profiles: { email: string } | { email: string }[] | null };
  const items: AdminMedia[] = ((data ?? []) as unknown as R[]).map(({ profiles, ...r }) => ({ ...r, email: (Array.isArray(profiles) ? profiles[0]?.email : profiles?.email) ?? null }));
  return (
    <>
      <PageHead title="Media (Backblaze B2)" sub="Everything generated or uploaded by users. Files are private; thumbnails use short-lived signed URLs." />
      {!storageConfigured() && <div className="card mb-4 border-warning/40 p-4 text-sm"><b>B2 is not configured.</b> Set <code>B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET</code> (see docs/SETUP.md).</div>}
      <MediaAdmin initial={items} />
    </>
  );
}
