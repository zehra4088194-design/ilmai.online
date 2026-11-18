import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { orChat } from '@/lib/openrouter';
import { creditsFor, addCredits } from '@/lib/credits';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({
  topic: z.string().min(3).max(2000),
  slides: z.number().int().min(3).max(20).default(8),
  language: z.string().default('English'),
  model: z.string().default('openai/gpt-4o-mini'),
});

const Deck = z.object({
  title: z.string(),
  slides: z.array(z.object({
    type: z.enum(['title', 'bullets', 'two_column', 'quote', 'closing']),
    title: z.string(),
    bullets: z.array(z.string()).optional(),
    left: z.array(z.string()).optional(),
    right: z.array(z.string()).optional(),
    quote: z.string().optional(),
    notes: z.string().optional(),
  })),
});

/**
 * Step 1 of presentations: topic -> validated slide JSON.
 * TODO: render the JSON to .pptx / .pdf (pptxgenjs, or port src/lib/presentation from the old ilmAI repo),
 *       upload with saveMedia({ kind: 'pptx' | 'pdf' }) and return the asset URL.
 */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('presentations', profile.plan, isAdmin);
  const b = Body.parse(await req.json());
  if (!isAdmin && profile.credits_balance <= 0) throw new HttpError(402, 'You are out of credits', 'out_of_credits');

  const settings = await getSettings();
  const started = Date.now();
  const r = await orChat({
    model: b.model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You create presentation outlines. Reply with ONLY valid JSON: {"title": string, "slides": [{"type": "title"|"bullets"|"two_column"|"quote"|"closing", "title": string, "bullets"?: string[], "left"?: string[], "right"?: string[], "quote"?: string, "notes"?: string}]}. First slide is "title", last is "closing". Keep bullets short.',
      },
      { role: 'user', content: `Topic: ${b.topic}\nSlides: ${b.slides}\nLanguage: ${b.language}` },
    ],
  });

  const raw = r.choices?.[0]?.message?.content ?? '';
  const deck = Deck.parse(JSON.parse(raw.replace(/^```json|```$/g, '').trim()));
  const cost = r.usage?.cost ?? 0;
  const charge = isAdmin ? 0 : creditsFor(cost, (r.usage?.prompt_tokens ?? 0) + (r.usage?.completion_tokens ?? 0), settings);
  if (charge) await addCredits(profile.id, -charge, 'presentation');
  await logUsage({ userId: profile.id, kind: 'presentation', model: b.model, costUsd: cost, creditsUsed: charge, latencyMs: Date.now() - started });
  return json({ deck });
});
