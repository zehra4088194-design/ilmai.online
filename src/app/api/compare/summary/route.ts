import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { utilityChat } from '@/lib/utility-ai';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  conversationId: z.string().uuid(),
  userMessageId: z.string().uuid(),
  answerIds: z.array(z.string().uuid()).min(1).max(25)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate answer IDs are not allowed'),
});

/** A Cloudflare Worker-routed synthesis of selected answers for one comparison turn. */
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

  const availableAnswers = (rows ?? []).filter((row) => typeof row.content === 'string' && row.content.trim().length > 0);
  const availableById = new Map(availableAnswers.map((answer) => [answer.id, answer]));
  const answers = body.answerIds.map((id) => availableById.get(id)).filter((answer): answer is NonNullable<typeof answer> => !!answer);
  if (answers.length !== body.answerIds.length) {
    throw new HttpError(400, 'One or more selected answers are unavailable for this comparison');
  }

  const maxCharactersPerAnswer = Math.min(4500, Math.floor(24_000 / answers.length));
  const inputs = answers.map((answer, index) => ({
    model: answer.model || 'AI model ' + (index + 1),
    answer: String(answer.content).slice(0, maxCharactersPerAnswer),
  }));
  const started = Date.now();
  try {
    const systemPrompt = inputs.length === 1
      ? 'You are a clear, impartial summarizer. Summarize the selected AI response to the user prompt. ' +
        'Preserve the key takeaways, useful details, important caveats and uncertainty. ' +
        'Do not invent facts or add unsupported information. Write in the same language and script as the user prompt. ' +
        'Use a short heading and compact bullets where useful. Return only the summary.'
      : 'You are an impartial comparison editor. Compare the selected AI answers to the same user prompt. ' +
        'Write a concise, useful summary in the same language and script as the user prompt. ' +
        'Identify agreement, meaningful differences, missing details and any answer that appears unsupported or incorrect. ' +
        'Do not invent facts, do not declare a winner without explaining why, and do not simply repeat each answer. ' +
        'Use short headings and compact bullets. Return only the comparison summary.';

    const result = await utilityChat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: 'User prompt:\n' + String(userMessage.content).slice(0, 2500) +
            '\n\nSelected model responses (JSON):\n' + JSON.stringify(inputs),
        },
      ],
      {
        userId: profile.id,
        maxTokens: 850,
        temperature: 0.2,
        timeoutMs: 12_000,
        tries: 4,
        deadlineMs: 48_000,
      },
    );

    const summary = result.text.trim().slice(0, 7000);
    if (!summary) throw new HttpError(502, 'The Worker utility model returned an empty summary');

    const summaryRow = answers[0];
    const previousMeta = summaryRow.meta && typeof summaryRow.meta === 'object' && !Array.isArray(summaryRow.meta)
      ? summaryRow.meta as Record<string, unknown>
      : {};
    const { error: saveError } = await db
      .from('messages')
      .update({
        meta: {
          ...previousMeta,
          comparison_summary: summary,
          comparison_summary_answer_ids: body.answerIds,
        },
      })
      .eq('id', summaryRow.id)
      .eq('user_id', profile.id);
    if (saveError) throw saveError;

    await logUsage({
      userId: profile.id,
      kind: 'compare_summary',
      model: result.model,
      provider: 'openrouter',
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.cost,
      latencyMs: Date.now() - started,
      usageDetails: { helper: 'comparison-summary', comparedAnswers: inputs.length, selectedAnswerIds: body.answerIds },
    });
    return json({ summary, messageId: summaryRow.id, answerIds: body.answerIds }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    await logUsage({
      userId: profile.id,
      kind: 'compare_summary',
      provider: 'openrouter',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
      usageDetails: { helper: 'comparison-summary', comparedAnswers: inputs.length },
    });
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'Could not create a comparison summary. Your model answers are still saved.', 'compare_summary_failed');
  }
});
