import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase/admin';
import { refreshUsdPkrRate } from '@/lib/exchange-rate';

export const dynamic = 'force-dynamic';

/** Call once a day: curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/daily-credits */
export async function GET(req: NextRequest) {
  if (!env.cronSecret || req.headers.get('authorization') !== `Bearer ${env.cronSecret}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await adminClient().rpc('grant_daily_credits');

  // Reuse the existing daily Coolify job for the USD/PKR refresh. A missing key or
  // provider outage must never block the free-credit top-up.
  let exchangeRate: { status: string; rate?: number; fetchedRate?: number | null; error?: string };
  try {
    const rate = await refreshUsdPkrRate();
    exchangeRate = { status: 'success', rate: rate.usdToPkr, fetchedRate: rate.fetchedRate };
  } catch (rateError) {
    exchangeRate = {
      status: env.exchangeRateApiKey ? 'fallback' : 'not_configured',
      error: rateError instanceof Error ? rateError.message : 'Could not refresh USD/PKR rate.',
    };
    console.warn('Daily USD/PKR refresh skipped:', exchangeRate.error);
  }

  if (error) return Response.json({ error: error.message, exchangeRate }, { status: 500 });
  return Response.json({ topped_up: data, exchangeRate });
}
