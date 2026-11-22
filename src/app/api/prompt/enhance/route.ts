import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { groqUtilityChat } from '@/lib/utility-ai';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ prompt: z.string().trim().min(1).max(6000) });

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('text_chat', profile.plan, isAdmin);
  const { prompt } = Body.parse(await req.json());
  const started = Date.now();

  try {
    const result = await groqUtilityChat(
      [
        {
          role: 'system',
          content:
            'You are an expert prompt editor. Rewrite the user prompt so another AI can execute it more accurately. ' +
            'Preserve the original intent and all facts. Add helpful structure, context, constraints, output format and acceptance criteria only when they logically follow from the request. ' +
            'Do not invent facts, tools, URLs, requirements, or deliverables. ' +
            'Write the improved prompt in the SAME language and script as the original (English, Urdu or Roman Urdu). ' +
            'Return only the improved prompt, with no preamble or commentary.',
        },
        { role: 'user', content: prompt },
      ],
      {
        userId: profile.id,
        maxTokens: 750,
        temperature: 0.2,
        timeoutMs: 9_000,
      },
    );

    const enhanced = result.text.trim();
    if (enhanced.length < 1 || enhanced.length > 8000) {
      throw new HttpError(502, 'The prompt enhancer returned an invalid result');
    }

    await logUsage({
      userId: profile.id,
      kind: 'prompt_enhance',
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.cost,
      latencyMs: Date.now() - started,
    });
    return json(
      { prompt: enhanced, model: result.model },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    await logUsage({
      userId: profile.id,
      kind: 'prompt_enhance',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    });
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Could not enhance this prompt. Please try again.', 'prompt_enhance_failed');
  }
});
