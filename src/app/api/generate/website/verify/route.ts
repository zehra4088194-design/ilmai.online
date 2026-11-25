import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { validateWebsiteProject } from '@/lib/website-builder';
import { runWebsiteBuildInSandbox } from '@/lib/website-sandbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 360;

const Body = z.object({
  requestId: z.string().uuid(),
  project: z.unknown(),
}).strict();

/**
 * Build verification is intentionally a separate request.
 * Users receive their generated project before this slower sandbox work begins.
 */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('text_chat', profile.plan, isAdmin);
  const body = Body.parse(await req.json());
  const project = validateWebsiteProject(body.project);
  const buildCheck = await runWebsiteBuildInSandbox(project, body.requestId);
  return json({ buildCheck }, { headers: { 'Cache-Control': 'private, no-store' } });
});
