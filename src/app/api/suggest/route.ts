import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { utilityChat } from '@/lib/utility-ai';
import { extractJson } from '@/lib/json-extract';
import { logUsage, countLast24h } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ user: z.string().min(1).max(4000), assistant: z.string().min(1).max(20000) });
const lastCall = new Map<string, number>(); // tiny per-instance cooldown; the daily cap below is the real limiter

/**
 * "What could I ask next?" – 3 follow-up ideas. Runs on FREE models (see lib/utility-ai.ts), costs the user no credits.
 * Never fails loudly: on any problem it returns an empty list and the UI simply shows nothing.
 */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('suggestions', profile.plan, isAdmin);
  const b = Body.parse(await req.json());
  const settings = await getSettings();

  const now = Date.now();
  if (now - (lastCall.get(profile.id) ?? 0) < 2000) return json({ suggestions: [] });
  lastCall.set(profile.id, now);
  if (!isAdmin && (await countLast24h(profile.id, 'suggest')) >= settings.suggestions_per_day) return json({ suggestions: [] });

  const started = Date.now();
  try {
    const r = await utilityChat(
      [
        { role: 'system', content: 'You suggest useful follow-up prompts for a general-purpose AI assistant conversation. Reply with ONLY a JSON array of exactly 3 short strings. No markdown.' },
        {
          role: 'user',
          content: `Conversation context: General-purpose AI assistant
Last question: ${b.user.slice(0, 600)}
Assistant's answer (may be truncated): ${b.assistant.slice(0, 1500)}

Suggest 3 different follow-up messages the user might send next: (1) go deeper, (2) ask for an example or practice question, (3) a closely related topic.
Each at most 12 words, written from the user's point of view, in the same language and script as the last question.`,
        },
      ],
      { userId: profile.id, maxTokens: 220, temperature: 0.8, timeoutMs: 20_000, tries: 3 },
    );
    const parsed = extractJson(r.text);
    const raw: unknown[] = Array.isArray(parsed) ? parsed : r.text.split('\n').map((l) => l.replace(/^[\s\-*\d.)"]+|["\s,]+$/g, ''));
    const suggestions = raw.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length >= 3 && x.length <= 140).slice(0, 3);
    await logUsage({ userId: profile.id, kind: 'suggest', model: r.model, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.cost, latencyMs: Date.now() - started });
    return json({ suggestions });
  } catch (e) {
    await logUsage({ userId: profile.id, kind: 'suggest', status: 'error', error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started });
    return json({ suggestions: [] });
  }
});
