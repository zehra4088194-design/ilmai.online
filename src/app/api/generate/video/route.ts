import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';

export const dynamic = 'force-dynamic';

/**
 * TODO(video): not implemented yet. Plan (see docs/ROADMAP.md):
 *  1. Check whether OpenRouter exposes video-output models; if not use a provider adapter (fal.ai / Replicate).
 *  2. Create a `media_assets` row with status 'pending', start the job, poll / webhook for completion.
 *  3. Download the finished file, upload to B2 with saveMedia({ kind: 'video', ... }), mark 'ready'.
 *  4. Charge credits + logUsage({ kind: 'video' }).
 */
export const POST = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('video_generation', profile.plan, isAdmin);
  return json({ error: 'Video generation is not implemented yet', code: 'not_implemented' }, 501);
});
