import 'server-only';
import { randomUUID } from 'node:crypto';
import { adminClient } from '@/lib/supabase/admin';
import { HttpError } from '@/lib/http';
import { creditsFor } from '@/lib/credits';
import type { AppSettings } from '@/lib/settings';
import type { ModelInfo } from '@/lib/models';
import type { UsageInput } from '@/lib/usage';

type Kind = 'chat' | 'compare' | 'image' | 'video' | 'presentation' | 'test';

export function generationEstimate(messages: unknown[], model: ModelInfo, settings: AppSettings, maxTokens: number) {
  const serialized = JSON.stringify(messages);
  const inputTokens = serialized.includes('image_url') || serialized.includes('file_data')
    ? model.context : Buffer.byteLength(serialized, 'utf8') + messages.length * 16;
  if (inputTokens + maxTokens > model.context && !serialized.includes('file_data') && !serialized.includes('image_url'))
    throw new HttpError(400, 'This conversation exceeds the selected model context. Start a new chat or choose a larger model.');
  const maxCost = (inputTokens * model.pricePromptPerM + maxTokens * model.priceCompletionPerM) / 1e6;
  return creditsFor(maxCost, inputTokens + maxTokens, settings);
}

export async function reserveGeneration(input: { userId: string; isAdmin: boolean; kind: Kind; key: string; maxCredits: number }) {
  if (!Number.isSafeInteger(input.maxCredits) || input.maxCredits < 0) throw new HttpError(500, 'Invalid generation price');
  const { data, error } = await adminClient().rpc('reserve_generation', {
    p_id: randomUUID(), p_user: input.userId, p_key: input.key, p_kind: input.kind, p_amount: input.isAdmin ? 0 : input.maxCredits,
  });
  if (error?.message.includes('insufficient_credits')) throw new HttpError(402, `Not enough available credits. This request reserves up to ${input.maxCredits} credits.`, 'out_of_credits');
  if (error) throw error;
  const r = data as { id: string; duplicate: boolean; status: string; result: unknown };
  if (r.duplicate) throw new HttpError(409, 'This generation request has already been submitted. Open its history instead of resending.', 'duplicate_generation');
  return r.id;
}

export async function settleGeneration(input: { id: string; userId: string; charge: number; usage: UsageInput; result?: Record<string, unknown>; message?: { conversation_id: string; content: string; meta: Record<string, unknown> } }) {
  const u = input.usage;
  const { data, error } = await adminClient().rpc('settle_generation', {
    p_id: input.id, p_user: input.userId, p_charge: input.charge,
    p_usage: { model: u.model, provider: u.model?.includes('::') ? u.model.split('::')[0] : 'openrouter', prompt_tokens: u.promptTokens ?? 0, completion_tokens: u.completionTokens ?? 0, cost_usd: u.costUsd ?? 0, latency_ms: u.latencyMs ?? null },
    p_result: input.result ?? null, p_message: input.message ?? null,
  });
  if (error) throw error;
  return data as { charged: number; balance?: number; messageId?: string };
}

export async function releaseGeneration(id: string, userId: string, cancelled = false) {
  const { error } = await adminClient().rpc('release_generation', { p_id: id, p_user: userId, p_cancelled: cancelled });
  if (error) throw error;
}
