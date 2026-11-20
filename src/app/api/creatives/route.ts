import { handle, json } from '@/lib/http';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export const GET=handle(async(req)=>{
  const location=new URL(req.url).searchParams.get('location');
  const allowed=['banner','image_template','video_template'];
  const db=adminClient();
  let query=db.from('site_creatives').select('id,title,alt_text,location,template_prompt,mime,storage_path,sort_order')
    .eq('is_active',true).order('sort_order').limit(100);
  if(location && allowed.includes(location)) query=query.eq('location',location);
  const {data,error}=await query;
  if(error) throw error;
  const storage=db.storage.from('site-banners');
  return json({creatives:(data??[]).map((item)=>({
    id:item.id,title:item.title,altText:item.alt_text,location:item.location,
    templatePrompt:item.template_prompt,mime:item.mime,
    url:storage.getPublicUrl(item.storage_path).data.publicUrl,
  }))},{headers:{'Cache-Control':'public, max-age=60'}});
});
