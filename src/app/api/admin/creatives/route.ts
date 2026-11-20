import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const MAX_BYTES=10*1024*1024;
const Locations=z.enum(['banner','image_template','video_template']);

function detectImage(bytes:Buffer):string|null {
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) return 'image/jpeg';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') return 'image/webp';
  if(bytes.length>=6&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))) return 'image/gif';
  return null;
}
const extension=(mime:string)=>mime==='image/png'?'png':mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':'gif';

export const GET=handle(async()=>{
  await requireAdminApi();
  const {data,error}=await adminClient().from('site_creatives').select('*').order('location').order('sort_order');
  if(error) throw error;
  const storage=adminClient().storage.from('site-banners');
  return json({creatives:(data??[]).map((item)=>({
    ...item,url:storage.getPublicUrl(item.storage_path).data.publicUrl,
  }))},{headers:{'Cache-Control':'private, no-store'}});
});

export const POST=handle(async(req:NextRequest)=>{
  const {user}=await requireAdminApi();
  const form=await req.formData();
  const file=form.get('file');
  if(!(file instanceof File)) throw new HttpError(400,'Select an image file');
  if(file.size<1||file.size>MAX_BYTES) throw new HttpError(413,'Image files must be 10 MB or smaller');
  const bytes=Buffer.from(await file.arrayBuffer());
  const mime=detectImage(bytes);
  if(!mime) throw new HttpError(400,'Only PNG, JPEG, WebP and GIF images are supported');
  const title=String(form.get('title')??'').trim().slice(0,160);
  const altText=String(form.get('altText')??title).trim().slice(0,300);
  const templatePrompt=String(form.get('templatePrompt')??'').trim().slice(0,6000);
  const location=Locations.parse(form.get('location'));
  const isActive=String(form.get('isActive')??'true')!=='false';
  const sortOrder=Math.max(0,Math.min(10000,Number(form.get('sortOrder')??0)||0));
  if((location==='image_template'||location==='video_template')&&!templatePrompt)
    throw new HttpError(400,'A reusable generation prompt is required for this template');
  const {data:{user:adminUser}}=await adminClient().auth.getUser(user.id);
  if(!adminUser) throw new HttpError(401,'Admin session could not be verified');
  const path='creatives/'+user.id+'/'+randomUUID()+'.'+extension(mime);
  const storage=adminClient().storage.from('site-banners');
  const uploaded=await storage.upload(path,bytes,{contentType:mime,upsert:false,cacheControl:'3600'});
  if(uploaded.error) throw new HttpError(502,'Could not upload creative to Supabase Storage');
  const {data,error}=await adminClient().from('site_creatives').insert({
    storage_path:path,mime,file_size_bytes:bytes.length,title,alt_text:altText,
    location,template_prompt:templatePrompt,is_active:isActive,sort_order:sortOrder,created_by:user.id,
  }).select('*').single();
  if(error) {
    await storage.remove([path]).catch(()=>undefined);
    throw error;
  }
  return json({creative:{...data,url:storage.getPublicUrl(path).data.publicUrl}},{status:201});
});

export const PATCH=handle(async(req:NextRequest)=>{
  await requireAdminApi();
  const body=z.object({
    id:z.string().uuid(),title:z.string().trim().max(160).optional(),
    alt_text:z.string().trim().max(300).optional(),
    template_prompt:z.string().trim().max(6000).optional(),
    is_active:z.boolean().optional(),sort_order:z.number().int().min(0).max(10000).optional(),
  }).strict().refine((item)=>Object.keys(item).length>1).parse(await req.json());
  const {id,...patch}=body;
  const {data,error}=await adminClient().from('site_creatives').update({...patch,updated_at:new Date().toISOString()})
    .eq('id',id).select('*').maybeSingle();
  if(error) throw error;
  if(!data) throw new HttpError(404,'Creative not found');
  return json({creative:{...data,url:adminClient().storage.from('site-banners').getPublicUrl(data.storage_path).data.publicUrl}});
});

export const DELETE=handle(async(req:NextRequest)=>{
  await requireAdminApi();
  const {id}=z.object({id:z.string().uuid()}).parse(await req.json());
  const db=adminClient();
  const {data,error}=await db.from('site_creatives').select('id,storage_path').eq('id',id).maybeSingle();
  if(error) throw error;
  if(!data) throw new HttpError(404,'Creative not found');
  const removed=await db.storage.from('site-banners').remove([data.storage_path]);
  if(removed.error) throw new HttpError(502,'Could not remove creative from storage');
  const deleted=await db.from('site_creatives').delete().eq('id',id);
  if(deleted.error) throw deleted.error;
  return json({ok:true});
});
