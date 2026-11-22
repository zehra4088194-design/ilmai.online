import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { saveMedia } from '@/lib/media';
import { signedDownloadUrl } from '@/lib/storage/b2';
import {
  downloadPicsartAsset,
  picsartPollModel,
} from '@/lib/picsart-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().uuid() });

const TERMINAL = new Set(['ready','failed','cancelled','expired']);
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

function videoSignature(bytes: Buffer) {
  return bytes.length > 12 && (
    bytes.toString('ascii',4,8) === 'ftyp' ||
    bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
  );
}

function resultVideoUrl(result: unknown) {
  if (!result || typeof result !== 'object') return null;
  const value = result as Record<string, unknown>;
  if (typeof value.url === 'string') return value.url;
  const items = Array.isArray(value.items) ? value.items : Array.isArray(value.results) ? value.results : [];
  const first = items[0];
  if (first && typeof first === 'object' && typeof (first as Record<string, unknown>).url === 'string') {
    return (first as Record<string, unknown>).url as string;
  }
  return null;
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

  const provider = await picsartPollModel(profile.id, String(job.provider_job_id), 45_000);
  const providerStatus = provider.status.toUpperCase();

  if (providerStatus === 'FAILED' || providerStatus === 'CANCELLED' || providerStatus === 'EXPIRED') {
    const mapped = providerStatus.toLowerCase() as 'failed'|'cancelled'|'expired';
    await failJob(job,profile.id,mapped,provider.error || 'Picsart video generation ' + mapped);
    const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
    return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
  }

  if (providerStatus !== 'COMPLETED') {
    if (providerStatus !== 'ACCEPTED' && providerStatus !== 'IN_PROGRESS' && providerStatus !== '') {
      throw new HttpError(502, 'Picsart returned an unknown video job status: ' + providerStatus, 'picsart_unknown_status');
    }
    const status = providerStatus === 'IN_PROGRESS' ? 'processing' : 'submitted';
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
      const completed = await db.rpc('complete_video_job',{
        p_job:id,p_user:profile.id,p_asset:existingAsset.id,p_charge:job.credits_reserved,
        p_usage:{
          model:job.model,provider:'picsart-video-api',
          prompt_tokens:0,completion_tokens:0,cost_usd:0,
          latency_ms:Math.max(0,Date.now()-new Date(job.submitted_at).getTime()),
        },
        p_result:{provider:'picsart',providerJobId:job.provider_job_id,providerCredits:Number(provider.usage?.credits ?? 0)},
      });
      if (completed.error) throw completed.error;
      const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
      return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
    }
  }

  const claim = await db.from('video_jobs').update({
    status:'downloading',last_polled_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    provider_usage:provider.usage ?? {},
  }).eq('id',id).eq('user_id',profile.id).in('status',['submitted','processing','storing']).select('id').maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) {
    const fresh = await db.from('video_jobs').select('*').eq('id',id).eq('user_id',profile.id).single();
    return json({job:await shapeJob(fresh.data)},{headers:{'Cache-Control':'private, no-store'}});
  }

  try {
    const url = resultVideoUrl(provider.result);
    if (!url) throw new HttpError(502,'Picsart completed the job but returned no video URL','empty_video_result');
    const downloaded = await downloadPicsartAsset(url, MAX_VIDEO_BYTES);
    const mime = downloaded.mime === 'video/webm' ? 'video/webm' : downloaded.mime === 'video/mp4' || downloaded.mime === 'application/octet-stream' ? 'video/mp4' : '';
    if (!mime || !videoSignature(downloaded.bytes)) {
      throw new HttpError(502,'Picsart returned a file that is not a valid MP4 or WebM video','invalid_video_output');
    }
    const media = await saveMedia({
      userId:profile.id,kind:'video',body:downloaded.bytes,mime,prompt:job.prompt,model:job.model,
      meta:{video_job_id:id,provider_job_id:job.provider_job_id,provider:'picsart',provider_usage:provider.usage ?? {},config:job.config},
    });
    const storing = await db.from('video_jobs').update({
      status:'storing',media_asset_id:media.id,provider_usage:provider.usage ?? {},
      last_polled_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }).eq('id',id).eq('user_id',profile.id).eq('status','downloading').select('id').maybeSingle();
    if (storing.error) throw storing.error;
    if (!storing.data) throw new HttpError(409,'Video job changed while the completed file was stored','video_job_conflict');

    const settlement = await db.rpc('complete_video_job',{
      p_job:id,p_user:profile.id,p_asset:media.id,p_charge:job.credits_reserved,
      p_usage:{
        model:job.model,provider:'picsart-video-api',
        prompt_tokens:0,completion_tokens:0,cost_usd:0,
        latency_ms:Math.max(0,Date.now()-new Date(job.submitted_at).getTime()),
      },
      p_result:{provider:'picsart',providerJobId:job.provider_job_id,providerCredits:Number(provider.usage?.credits ?? 0)},
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
