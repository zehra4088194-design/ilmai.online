import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import type { AppSettings } from '@/lib/settings';
import { HttpError } from '@/lib/http';

export function creditsFor(costUsd: number, totalTokens: number, s: AppSettings) {
  if (!Number.isFinite(costUsd) || costUsd < 0 || !Number.isFinite(totalTokens) || totalTokens < 0) throw new HttpError(502, 'Invalid provider usage');
  const byCost = costUsd > 0 ? Math.ceil(costUsd * s.credits_per_usd) : Math.ceil(totalTokens / 1000);
  return Math.max(s.min_credits_per_msg, byCost);
}

/** Atomically add (+) or remove (−) credits and write a ledger row. */
export async function addCredits(userId: string, delta: number, reason: string) {
  const { data, error } = await adminClient().rpc('grant_credits', { p_user: userId, p_amount: delta, p_reason: reason });
  if (error) throw error;
  return data as number;
}
