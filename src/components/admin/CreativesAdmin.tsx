'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Trash2, Eye, EyeOff, Save } from 'lucide-react';
import { useToast } from '@/components/providers';
import { api } from '@/lib/client-api';

type Creative = {
  id:string;title:string;alt_text:string;location:'banner'|'image_template'|'video_template';
  template_prompt:string;mime:string;file_size_bytes:number;is_active:boolean;sort_order:number;url:string;
};
const LABEL:Record<Creative['location'],string>={
  banner:'Site banner',image_template:'Image template',video_template:'Video template',
};

export function CreativesAdmin({initial}:{initial:Creative[]}) {
  const toast=useToast();
  const [items,setItems]=useState(initial);
  const [file,setFile]=useState<File|null>(null);
  const [title,setTitle]=useState('');
  const [altText,setAltText]=useState('');
  const [location,setLocation]=useState<Creative['location']>('image_template');
  const [prompt,setPrompt]=useState('');
  const [active,setActive]=useState(true);
  const [sortOrder,setSortOrder]=useState(0);
  const [busy,setBusy]=useState(false);

  const refresh=useCallback(async()=>{
    const result=await api<{creatives:Creative[]}>('/api/admin/creatives','GET');
    setItems(result.creatives??[]);
  },[]);
  useEffect(()=>{refresh().catch(e=>toast(e.message,'err'));},[refresh,toast]);

  async function upload(event:React.FormEvent) {
    event.preventDefault();
    if(!file||busy)return;
    setBusy(true);
    try {
      const data=new FormData();
      data.set('file',file);data.set('title',title);data.set('altText',altText);
      data.set('location',location);data.set('templatePrompt',prompt);
      data.set('isActive',String(active));data.set('sortOrder',String(sortOrder));
      const response=await fetch('/api/admin/creatives',{
        method:'POST',body:data,credentials:'same-origin',cache:'no-store',
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error??'Upload failed');
      setItems((current)=>[result.creative,...current]);
      setFile(null);setTitle('');setAltText('');setPrompt('');
      const input=document.getElementById('creative-file') as HTMLInputElement|null;
      if(input) input.value='';
      toast('Creative uploaded','ok');
    }catch(e){toast(e instanceof Error?e.message:'Upload failed','err');}
    finally{setBusy(false);}
  }

  async function toggle(item:Creative) {
    try {
      const result=await api<{creative:Creative}>('/api/admin/creatives','PATCH',{
        id:item.id,is_active:!item.is_active,
      });
      setItems((current)=>current.map((row)=>row.id===item.id?{...row,...result.creative}:row));
    }catch(e){toast(e instanceof Error?e.message:'Could not update','err');}
  }

  async function del(item:Creative) {
    if(!window.confirm('Delete this creative image?'))return;
    try {
      await api('/api/admin/creatives','DELETE',{id:item.id});
      setItems((current)=>current.filter((row)=>row.id!==item.id));
      toast('Creative deleted','ok');
    }catch(e){toast(e instanceof Error?e.message:'Delete failed','err');}
  }

  return (
    <div className="space-y-6">
      <form onSubmit={upload} className="glass space-y-3 rounded-3xl p-4 sm:p-6">
        <div><h2 className="text-lg font-bold">Upload site creative</h2><p className="text-sm text-muted-foreground">PNG, JPEG, WebP or GIF up to 10 MB. Images are stored in the dedicated public site-banners bucket.</p></div>
        <label className="block space-y-1 text-sm font-medium">Image file<input id="creative-file" className="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e)=>setFile(e.target.files?.[0]??null)} required/></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Title<input className="input" maxLength={160} value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g. Exam week promotion"/></label>
          <label className="space-y-1 text-sm font-medium">Creative type<select className="input" value={location} onChange={(e)=>setLocation(e.target.value as Creative['location'])}><option value="banner">Site banner</option><option value="image_template">Image-generation template</option><option value="video_template">Video-generation template</option></select></label>
        </div>
        <label className="block space-y-1 text-sm font-medium">Alt text<input className="input" maxLength={300} value={altText} onChange={(e)=>setAltText(e.target.value)} placeholder="Describe the image for accessibility"/></label>
        {location!=='banner'&&<label className="block space-y-1 text-sm font-medium">Reusable generation prompt<textarea className="input min-h-24" maxLength={6000} value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Describe the visual style or reusable prompt instructions"/></label>}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)}/>Active / visible to users</label>
          <label className="flex items-center gap-2 text-sm">Sort order<input type="number" min={0} max={10000} className="input w-24" value={sortOrder} onChange={(e)=>setSortOrder(Number(e.target.value))}/></label>
          <button className="btn-primary ml-auto" disabled={!file||busy||(location!=='banner'&&!prompt.trim())}><ImagePlus className="h-4 w-4"/>{busy?'Uploading…':'Upload creative'}</button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Uploaded creatives</h2><p className="text-xs text-muted-foreground">{items.length} files</p></div><button className="btn-outline text-xs" onClick={()=>refresh().catch(e=>toast(e.message,'err'))}>Refresh</button></div>
        {items.length===0?<div className="card p-8 text-center text-sm text-muted-foreground">No banners or templates have been uploaded.</div>:
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item)=>(
              <article key={item.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.alt_text||item.title} className="aspect-video w-full bg-muted object-cover"/>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2"><p className="truncate font-semibold">{item.title||'Untitled creative'}</p><span className="badge">{LABEL[item.location]}</span></div>
                  {item.template_prompt&&<p className="line-clamp-3 text-xs text-muted-foreground">{item.template_prompt}</p>}
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-xs text-muted-foreground">{(item.file_size_bytes/1024).toFixed(0)} KB · {item.mime}</span>
                    <div className="flex gap-1">
                      <button className="btn-ghost h-8 w-8 !p-0" title={item.is_active?'Hide':'Show'} onClick={()=>toggle(item)}>{item.is_active?<Eye className="h-4 w-4"/>:<EyeOff className="h-4 w-4"/>}</button>
                      <button className="btn-ghost h-8 w-8 !p-0 text-danger" title="Delete" onClick={()=>del(item)}><Trash2 className="h-4 w-4"/></button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>}
      </section>
    </div>
  );
}
