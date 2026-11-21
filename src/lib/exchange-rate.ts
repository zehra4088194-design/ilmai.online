import 'server-only';
import { revalidateTag } from 'next/cache';
import { adminClient } from '@/lib/supabase/admin';

export type UsdPkrRateMode = 'auto' | 'manual';
export type UsdPkrRateSource = 'preview' | 'manual' | 'ExchangeRate-API';
export type UsdPkrRate = {
  usdToPkr: number;
  base: 'USD';
  target: 'PKR';
  mode: UsdPkrRateMode;
  lastUpdated: string | null;
  fetchedAt: string | null;
  fetchedRate: number | null;
  source: UsdPkrRateSource;
};

export const DEFAULT_USD_PKR_RATE: UsdPkrRate = {
  // Preview-only reference value. The first successful API refresh replaces it in Auto mode.
  usdToPkr: 276.51,
  base: 'USD',
  target: 'PKR',
  mode: 'auto',
  lastUpdated: null,
  fetchedAt: null,
  fetchedRate: null,
  source: 'preview',
};

export function normalizeUsdPkrRate(value: unknown): UsdPkrRate {
  const input = value && typeof value === 'object' ? value as Partial<UsdPkrRate> : {};
  const usdToPkr = Number(input.usdToPkr);
  const fetchedRate = Number(input.fetchedRate);
  return {
    usdToPkr: Number.isFinite(usdToPkr) && usdToPkr > 0 && usdToPkr < 10000
      ? usdToPkr
      : DEFAULT_USD_PKR_RATE.usdToPkr,
    base: 'USD',
    target: 'PKR',
    mode: input.mode === 'manual' ? 'manual' : 'auto',
    lastUpdated: typeof input.lastUpdated === 'string' && input.lastUpdated ? input.lastUpdated : null,
    fetchedAt: typeof input.fetchedAt === 'string' && input.fetchedAt ? input.fetchedAt : null,
    fetchedRate: Number.isFinite(fetchedRate) && fetchedRate > 0 && fetchedRate < 10000 ? fetchedRate : null,
    source: input.source === 'manual' || input.source === 'ExchangeRate-API' ? input.source : 'preview',
  };
}

export async function getUsdPkrRate(): Promise<UsdPkrRate> {
  try {
    const { data, error } = await adminClient()
      .from('app_settings')
      .select('value')
      .eq('key', 'usd_pkr_rate')
      .maybeSingle();
    if (error) throw error;
    return normalizeUsdPkrRate(data?.value);
  } catch {
    return DEFAULT_USD_PKR_RATE;
  }
}

export async function saveUsdPkrRate(value: UsdPkrRate): Promise<UsdPkrRate> {
  const rate = normalizeUsdPkrRate(value);
  const { error } = await adminClient().from('app_settings').upsert({
    key: 'usd_pkr_rate',
    value: rate,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  if (error) throw error;
  revalidateTag('settings');
  return rate;
}

type ExchangeRateApiResponse = {
  result?: string;
  conversion_rate?: number;
  base_code?: string;
  target_code?: string;
  time_last_update_utc?: string;
  'error-type'?: string;
};

export async function refreshUsdPkrRate(): Promise<UsdPkrRate> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY?.trim();
  if (!apiKey) throw new Error('EXCHANGE_RATE_API_KEY is not configured in Coolify.');

  // Use Bearer auth so the API key is not exposed in request URLs or URL access logs.
  const response = await fetch(
    'https://v6.exchangerate-api.com/v6/pair/USD/PKR',
    {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok) throw new Error('ExchangeRate-API returned HTTP ' + response.status);
  const data = await response.json() as ExchangeRateApiResponse;
  const fetchedRate = Number(data.conversion_rate);
  if (
    data.result !== 'success' ||
    !Number.isFinite(fetchedRate) ||
    fetchedRate <= 0 ||
    fetchedRate >= 10000 ||
    (data.base_code && data.base_code !== 'USD') ||
    (data.target_code && data.target_code !== 'PKR')
  ) {
    throw new Error(data['error-type'] || 'ExchangeRate-API returned an invalid USD/PKR rate.');
  }

  const current = await getUsdPkrRate();
  return saveUsdPkrRate({
    ...current,
    // Manual mode keeps the admin's chosen applied rate; the fetched rate is still recorded.
    usdToPkr: current.mode === 'manual' ? current.usdToPkr : fetchedRate,
    fetchedRate,
    fetchedAt: new Date().toISOString(),
    lastUpdated: data.time_last_update_utc || null,
    source: 'ExchangeRate-API',
  });
}
