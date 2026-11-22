import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import type { AppSettings } from '@/lib/settings';
import { HttpError } from '@/lib/http';

export type CreditChargeResult = {
  walletBalance: number;
  planCreditsUsed: number;
  walletCreditsUsed: number;
  planBucketId: string | null;
  duplicate?: boolean;
};

export function creditMultiplierFor(tier: 'free'|'pro'|'elite', s: Pick<AppSettings,'standard_model_multiplier'|'premium_model_multiplier'>) {
  const value = tier === 'free' ? s.standard_model_multiplier : s.premium_model_multiplier;
  if (!Number.isFinite(value) || value <= 0 || value > 20) throw new HttpError(500, 'The model credit multiplier is not configured correctly');
  return value;
}

export function creditsFor(costUsd: number, totalTokens: number, s: AppSettings, multiplier = 1) {
  if (!Number.isFinite(costUsd) || costUsd < 0 || !Number.isFinite(totalTokens) || totalTokens < 0 ||
      !Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 20) {
    throw new HttpError(502, 'Invalid provider usage or model multiplier');
  }
  const base = costUsd > 0 ? costUsd * s.credits_per_usd : totalTokens / 1000;
  return Math.max(s.min_credits_per_msg, Math.ceil(base * multiplier));
}

/** Available credits across the current plan allowance and permanent wallet. */
export async function getAvailableCredits(userId: string) {
  const { data, error } = await adminClient().rpc('get_credit_balances', { p_user: userId });
  if (error) throw error;
  if (!data) return 0;
  const wallet = Math.max(0, Number(data.walletBalance ?? 0) - Number(data.walletReserved ?? 0));
  const plan = Math.max(0, Number(data.planBalance ?? 0) - Number(data.planReserved ?? 0));
  return wallet + plan;
}

/** Atomic debit: current plan credits first, then permanent wallet credits. */
export async function chargeCredits(userId: string, amount: number, reason: string, idempotencyKey?: string): Promise<CreditChargeResult> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpError(500, 'Invalid credit charge');
  const { data, error } = await adminClient().rpc('charge_credits', {
    p_user: userId, p_amount: amount, p_reason: reason, p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) {
    if (error.message.includes('insufficient_credits')) throw new HttpError(402, 'Not enough available credits', 'out_of_credits');
    throw error;
  }
  return data as CreditChargeResult;
}

/** Atomically add (+) or remove (−) credits and write a ledger row. */
export async function addCredits(userId: string, delta: number, reason: string) {
  const { data, error } = await adminClient().rpc('grant_credits', { p_user: userId, p_amount: delta, p_reason: reason });
  if (error) throw error;
  return data as number;
}
