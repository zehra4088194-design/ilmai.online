import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { aiRouterFetch } from '@/lib/ai-router';
import { saveMedia } from '@/lib/media';
import { signedDownloadUrl } from '@/lib/storage/b2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().uuid() });
type ProviderJob = {
  id?: string; status?: string; error?: string;
  usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  generation_id?: string;
};

const TERMINAL = new Set(['ready','failed','cancelled','expired']);
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

function videoSignature(bytes: Buffer) {
  return bytes.length > 12 && (
    bytes.toString('ascii',4,8) === 'ftyp' ||
    bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
  );
}

async function boundedBuffer(response: Response) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_VIDEO_BYTES) throw new HttpError(413, 'Generated video exceeds the storage limit', 'video_too_large');
  if (!response.body) throw new HttpError(502, 'Video provider returned an empty file', 'empty_video');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_VIDEO_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, 'Generated video exceeds the storage limit', 'video_too_large');
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks, total);
  if (!videoSignature(bytes)) throw new HttpError(502, 'Provider file is not a valid MP4 or WebM video', 'invalid_video_output');
  return bytes;
}

async function shapeJob(row: Record<string, unknown>) {
  let downloadUrl: string | null = null;
  if (row.status === 'ready' && typeof row.media_asset_id === 'string') {
    const { data: asset, error } = await adminClient().from('media_assets').select('storage_key')
      .eq('id',row.media_asset_id).eq('user_id',row.user_id).eq('kind','video').eq('status','ready').maybeSingle();
    if (error) throw error;
    if (asset) downloadUrl = await signedDownloadUrl(asset.storage_key,300);
  }
  return {
    id:row.id,status:row.status,model:row.model,prompt:row.prompt,config:row.config,
    error:row.error,creditsCharged:row.credits_charged,createdAt:row.created_at,
    updatedAt:row.updated_at,completedAt:row.completed_at,downloadUrl,
  };
}

async function failJob(job: Record<string, unknown>, userId: string, status: 'failed'|'cancelled'|'expired', message: string) {
  const { error } = await adminClient().rpc('fail_video_job', {
    p_job:job.id,p_user:userId,p_status:status,p_error:message,
  });
  if (error) throw error;
}

export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const db = adminClient();
  const { data: job, error } = await db.from('video_jobs').select('*')
    .eq('id',id).eq('user_id',profile.id).maybeSingle();
  if (error) throw error;
  if (!job) throw new HttpError(404,'Video job not found');
  if (TERMINAL.has(job.status) || String(job.provider_job_id).startsWith('pending:'))
    return json({job:await shapeJob(job)},{headers:{'Cache-Control':'private, no-store'}});

  const lastPoll = job.last_polled_at ? new Date(job.last_polled_at).getTime() : 0;
  if (job.status !== 'storing' && Date.now()-lastPoll < 15_000)
    return json({job:await shapeJob(job)},{headers:{'Cache-Control':'private, no-store'}});

  const poll = await aiRouterFetch({
    userId:profile.id,path:'/v1/videos/'+encodeURIComponent(job.provider_job_id),
    method:'GET',signal:AbortSignal.timeout(45_000),
  });
  if (!poll.ok) {
    const detail = await poll.text().catch(()=>'');
    await db.from('video_jobs').update({last_polled_at:new Date().toISOString()}).eq('id',id).eq('user_id',profile.id);
    throw new HttpError(poll.status>=500?503:poll.status,detail.slice(0,300)||'Could not check video generation status','video_poll_failed');
  }
  const provider = await poll.json().catch(()=>({})) as ProviderJob;
  const providerStatus = String(provider.status ?? '').toLowerCase();

  if (providerStatus === 'failed' || providerStatus === 'cancelled' || providerStatus === 'expired') {
    await failJob(job,profile.id,providerStatus as 'failed'|'cancelled'|'expired',provider.error ?? 'Video generation '+providerStatus);
    const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
    return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
  }

  if (providerStatus !== 'completed') {
    const status = providerStatus === 'processing' ? 'processing' : 'submitted';
    await db.from('video_jobs').update({
      status,last_polled_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      provider_usage:provider.usage ?? {},
    }).eq('id',id).eq('user_id',profile.id).in('status',['queued','submitted','processing']);
    const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
    return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
  }

  if (job.status === 'storing' && job.media_asset_id) {
    const { data: existingAsset, error: assetError } = await db.from('media_assets').select('id')
      .eq('id',job.media_asset_id).eq('user_id',profile.id).eq('kind','video').eq('status','ready').maybeSingle();
    if (assetError) throw assetError;
    if (existingAsset) {
      const usage = {
        model:job.model,provider:'openrouter-video-api',
        prompt_tokens:Number(provider.usage?.prompt_tokens ?? 0),
        completion_tokens:Number(provider.usage?.completion_tokens ?? 0),
        cost_usd:Number(provider.usage?.cost ?? 0),
        latency_ms:Math.max(0,Date.now()-new Date(job.submitted_at).getTime()),
      };
      const completed = await db.rpc('complete_video_job',{
        p_job:id,p_user:profile.id,p_asset:existingAsset.id,p_charge:job.credits_reserved,p_usage:usage,
        p_result:{providerGenerationId:provider.generation_id ?? null},
      });
      if (completed.error) throw completed.error;
      const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
      return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
    }
  }

  const claim = await db.from('video_jobs').update({
    status:'downloading',last_polled_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    provider_usage:provider.usage ?? {},
  }).eq('id',id).eq('user_id',profile.id).in('status',['submitted','processing']).select('id').maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) {
    const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
    return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
  }

  try {
    const videoResponse = await aiRouterFetch({
      userId:profile.id,path:'/v1/videos/'+encodeURIComponent(job.provider_job_id)+'/content?index=0',
      method:'GET',signal:AbortSignal.timeout(90_000),
    });
    if (!videoResponse.ok) {
      const detail = await videoResponse.text().catch(()=>'');
      throw new HttpError(502,detail.slice(0,300)||'Could not download generated video','video_download_failed');
    }
    const bytes = await boundedBuffer(videoResponse);
    const contentType = (videoResponse.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
    const mime = contentType === 'video/webm' ? 'video/webm' : 'video/mp4';
    const media = await saveMedia({
      userId:profile.id,kind:'video',body:bytes,mime,prompt:job.prompt,model:job.model,
      meta:{video_job_id:id,provider_job_id:job.provider_job_id,generation_id:provider.generation_id ?? null,config:job.config},
    });
    const storing = await db.from('video_jobs').update({
      status:'storing',media_asset_id:media.id,provider_usage:provider.usage ?? {},
      last_polled_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }).eq('id',id).eq('user_id',profile.id).eq('status','downloading').select('id').maybeSingle();
    if (storing.error) throw storing.error;
    if (!storing.data) throw new HttpError(409,'Video job changed while the completed file was stored','video_job_conflict');

    const usage = {
      model:job.model,provider:'openrouter-video-api',
      prompt_tokens:Number(provider.usage?.prompt_tokens ?? 0),
      completion_tokens:Number(provider.usage?.completion_tokens ?? 0),
      cost_usd:Number(provider.usage?.cost ?? 0),
      latency_ms:Math.max(0,Date.now()-new Date(job.submitted_at).getTime()),
    };
    const settlement = await db.rpc('complete_video_job',{
      p_job:id,p_user:profile.id,p_asset:media.id,p_charge:job.credits_reserved,p_usage:usage,
      p_result:{providerGenerationId:provider.generation_id ?? null},
    });
    if (settlement.error) throw settlement.error;
    const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
    return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    await db.from('video_jobs').update({
      status:'processing',error:error instanceof Error?error.message.slice(0,1000):'Video download failed',
      updated_at:new Date().toISOString(),
    }).eq('id',id).eq('user_id',profile.id).eq('status','downloading');
    throw error instanceof HttpError?error:new HttpError(502,error instanceof Error?error.message:'Video processing failed','video_processing_failed');
  }
});
