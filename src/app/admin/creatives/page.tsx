import { PageHead } from '@/components/admin/AdminShell';
import { CreativesAdmin } from '@/components/admin/CreativesAdmin';
import { requireAdminPage } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export default async function Page() {
  await requireAdminPage();
  const {data}=await adminClient().from('site_creatives').select('*').order('location').order('sort_order');
  const storage=adminClient().storage.from('site-banners');
  const initial=(data??[]).map((item)=>({...item,url:storage.getPublicUrl(item.storage_path).data.publicUrl}));
  return <>
    <PageHead title="Banners & templates" sub="Upload the site announcement banner and reusable prompts for Image and Video Studio."/>
    <CreativesAdmin initial={initial}/>
  </>;
}
