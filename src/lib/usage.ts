import 'server-only';
import { adminClient } from '@/lib/supabase/admin';

export type UsageInput = {
  userId: string | null;
  kind: 'chat' | 'compare' | 'image' | 'video' | 'presentation' | 'test' | 'quiz' | 'suggest' | 'prompt_enhance' | 'website';
  model?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  creditsUsed?: number;
  latencyMs?: number;
  status?: 'ok' | 'error';
  error?: string;
};

/** Fire-and-forget analytics row (never throws). */
export async function logUsage(u: UsageInput) {
  try {
    await adminClient().from('usage_events').insert({
      user_id: u.userId,
      kind: u.kind,
      model: u.model ?? null,
      prompt_tokens: u.promptTokens ?? 0,
      completion_tokens: u.completionTokens ?? 0,
      cost_usd: u.costUsd ?? 0,
      credits_used: u.creditsUsed ?? 0,
      latency_ms: u.latencyMs ?? null,
      status: u.status ?? 'ok',
      error: u.error?.slice(0, 500) ?? null,
    });
  } catch (e) {
    console.error('[usage] failed to log', e);
  }
}

/** How many events of a kind a user produced in the last 24 h (used for daily caps on free-model features). */
export async function countLast24h(userId: string, kind: string) {
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await adminClient().from('usage_events').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', kind).gte('created_at', since);
  return count ?? 0;
}
