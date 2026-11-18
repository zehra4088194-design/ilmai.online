import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { orChat } from '@/lib/openrouter';
import { saveMedia, parseDataUrl } from '@/lib/media';
import { creditsFor, addCredits } from '@/lib/credits';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({ prompt: z.string().min(3).max(4000), model: z.string().optional() });

/**
 * Image generation through OpenRouter (models whose output_modalities include "image").
 * The default model comes from feature_flags.config.default_model (editable in /admin/features).
 * Result is uploaded to Backblaze B2 and recorded in media_assets.
 */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const flag = await requireFeature('image_generation', profile.plan, isAdmin);
  const { prompt, model: asked } = Body.parse(await req.json());
  if (!isAdmin && profile.credits_balance <= 0) throw new HttpError(402, 'You are out of credits', 'out_of_credits');

  const model = asked ?? (flag.config?.default_model as string | undefined) ?? 'google/gemini-2.5-flash-image';
  const settings = await getSettings();
  const started = Date.now();

  try {
    const r = await orChat({ model, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'] });
    const images = r.choices?.[0]?.message?.images ?? [];
    if (!images.length) throw new HttpError(502, 'The model returned no image. Try another prompt or model.');

    const assets = [];
    for (const img of images) {
      const parsed = parseDataUrl(img.image_url.url);
      if (!parsed) continue;
      assets.push(await saveMedia({ userId: profile.id, kind: 'image', body: parsed.buffer, mime: parsed.mime, prompt, model }));
    }
    const cost = r.usage?.cost ?? 0;
    const charge = isAdmin ? 0 : creditsFor(cost, (r.usage?.prompt_tokens ?? 0) + (r.usage?.completion_tokens ?? 0), settings);
    if (charge) await addCredits(profile.id, -charge, `image:${model}`);
    await logUsage({ userId: profile.id, kind: 'image', model, costUsd: cost, creditsUsed: charge, latencyMs: Date.now() - started });
    return json({ assets: assets.map((a) => ({ id: a.id, url: a.url })) });
  } catch (e) {
    await logUsage({ userId: profile.id, kind: 'image', model, status: 'error', error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started });
    throw e;
  }
});
