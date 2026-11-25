import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { groqTaskChat } from '@/lib/utility-ai';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  conversationId: z.string().uuid(),
  userMessageId: z.string().uuid(),
});

/** A Groq-only synthesis of the models that answered one comparison turn. */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('compare_models', profile.plan, isAdmin);
  const body = Body.parse(await req.json());
  const db = adminClient();

  const { data: conversation, error: conversationError } = await db
    .from('conversations')
    .select('id')
    .eq('id', body.conversationId)
    .eq('user_id', profile.id)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new HttpError(404, 'Conversation not found');

  const { data: userMessage, error: userError } = await db
    .from('messages')
    .select('content')
    .eq('id', body.userMessageId)
    .eq('conversation_id', body.conversationId)
    .eq('user_id', profile.id)
    .eq('role', 'user')
    .maybeSingle();
  if (userError) throw userError;
  if (!userMessage) throw new HttpError(404, 'Comparison prompt not found');

  const { data: rows, error: answersError } = await db
    .from('messages')
    .select('id,model,content,meta')
    .eq('conversation_id', body.conversationId)
    .eq('user_id', profile.id)
    .eq('role', 'assistant')
    .contains('meta', { turn: body.userMessageId })
    .order('created_at', { ascending: true });
  if (answersError) throw answersError;

  const answers = (rows ?? []).filter((row) => typeof row.content === 'string' && row.content.trim().length > 0);
  if (answers.length < 2) throw new HttpError(409, 'At least two completed model answers are needed for a comparison summary');

  const inputs = answers.slice(0, 6).map((answer, index) => ({
    model: answer.model || 'AI model ' + (index + 1),
    answer: String(answer.content).slice(0, 4500),
  }));
  const started = Date.now();
  try {
    const result = await groqTaskChat(
      [
        {
          role: 'system',
          content:
            'You are an impartial comparison editor. Compare the supplied AI answers to the same user prompt. ' +
            'Write a concise, useful summary in the same language and script as the user prompt. ' +
            'Identify agreement, meaningful differences, missing details and any answer that appears unsupported or incorrect. ' +
            'Do not invent facts, do not declare a winner without explaining why, and do not simply repeat each answer. ' +
            'Use short headings and compact bullets. Return only the comparison summary.',
        },
        {
          role: 'user',
          content: 'User prompt:\n' + String(userMessage.content).slice(0, 2500) +
            '\n\nModel answers (JSON):\n' + JSON.stringify(inputs),
        },
      ],
      { userId: profile.id, task: 'comparison-summary', maxTokens: 850, temperature: 0.2, timeoutMs: 14_000 },
    );

    const summary = result.text.trim().slice(0, 7000);
    if (!summary) throw new HttpError(502, 'Groq returned an empty comparison summary');

    const summaryRow = answers[0];
    const previousMeta = summaryRow.meta && typeof summaryRow.meta === 'object' && !Array.isArray(summaryRow.meta)
      ? summaryRow.meta as Record<string, unknown>
      : {};
    const { error: saveError } = await db
      .from('messages')
      .update({ meta: { ...previousMeta, comparison_summary: summary } })
      .eq('id', summaryRow.id)
      .eq('user_id', profile.id);
    if (saveError) throw saveError;

    await logUsage({
      userId: profile.id,
      kind: 'compare_summary',
      model: result.model,
      provider: 'groq',
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.cost,
      latencyMs: Date.now() - started,
      usageDetails: { helper: 'comparison-summary', comparedAnswers: inputs.length },
    });
    return json({ summary, messageId: summaryRow.id }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    await logUsage({
      userId: profile.id,
      kind: 'compare_summary',
      provider: 'groq',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
      usageDetails: { helper: 'comparison-summary', comparedAnswers: inputs.length },
    });
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'Could not create a comparison summary. Your model answers are still saved.', 'compare_summary_failed');
  }
});
