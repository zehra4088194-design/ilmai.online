import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { groqUtilityChat } from '@/lib/utility-ai';
import { extractJson } from '@/lib/json-extract';
import { logUsage, countLast24h } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  user: z.string().min(1).max(4000),
  assistant: z.string().min(1).max(20000),
});
const lastCall = new Map<string, number>();

/**
 * Produces three follow-up ideas through Groq only; it never falls back to OpenRouter or Gemini.
 */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('suggestions', profile.plan, isAdmin);
  const body = Body.parse(await req.json());
  const settings = await getSettings();

  const now = Date.now();
  if (now - (lastCall.get(profile.id) ?? 0) < 2000) return json({ suggestions: [] });
  lastCall.set(profile.id, now);
  if (!isAdmin && (await countLast24h(profile.id, 'suggest')) >= settings.suggestions_per_day) {
    return json({ suggestions: [] });
  }

  const started = Date.now();
  try {
    const result = await groqUtilityChat(
      [
        {
          role: 'system',
          content:
            'You suggest useful follow-up prompts for a general-purpose AI assistant conversation. ' +
            'Reply with ONLY a JSON array of exactly 3 short strings. No markdown.',
        },
        {
          role: 'user',
          content:
            'Conversation context: General-purpose AI assistant\n' +
            'Last question: ' + body.user.slice(0, 600) + '\n' +
            "Assistant's answer (may be truncated): " + body.assistant.slice(0, 1500) + '\n\n' +
            'Suggest 3 different follow-up messages the user might send next: (1) go deeper, (2) ask for an example or practice question, (3) a closely related topic.\n' +
            'Each at most 12 words, written from the user point of view, in the same language and script as the last question (English, Urdu or Roman Urdu).',
        },
      ],
      {
        userId: profile.id,
        maxTokens: 220,
        temperature: 0.7,
        timeoutMs: 10_000,
      },
    );

    const parsed = extractJson(result.text);
    const raw: unknown[] = Array.isArray(parsed)
      ? parsed
      : result.text.split('\n').map((line) => line.replace(/^[\s\-*\d.)"]+|["\s,]+$/g, ''));

    const suggestions = raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && item.length <= 140)
      .slice(0, 3);

    await logUsage({
      userId: profile.id,
      kind: 'suggest',
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.cost,
      latencyMs: Date.now() - started,
    });
    return json({ suggestions });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('[suggest] failed:', reason);
    await logUsage({
      userId: profile.id,
      kind: 'suggest',
      status: 'error',
      error: reason,
      latencyMs: Date.now() - started,
    });
    return json({ suggestions: [], reason: 'unavailable' });
  }
});
