import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { getUsdPkrRate, refreshUsdPkrRate, saveUsdPkrRate } from '@/lib/exchange-rate';

export const dynamic='force-dynamic';

const RatePatch=z.object({
  mode:z.enum(['auto','manual']),
  usdToPkr:z.number().min(1).max(10000),
}).strict();

export const GET=handle(async()=>{
  await requireAdminApi();
  return json(
    {exchangeRate:await getUsdPkrRate(),apiConfigured:!!process.env.EXCHANGE_RATE_API_KEY},
    {headers:{'Cache-Control':'private, no-store'}}
  );
});

export const PATCH=handle(async(req:NextRequest)=>{
  await requireAdminApi();
  const body=RatePatch.parse(await req.json());
  const current=await getUsdPkrRate();
  const next=await saveUsdPkrRate({
    ...current,
    mode:body.mode,
    usdToPkr:body.mode==='manual'?body.usdToPkr:(current.fetchedRate??current.usdToPkr),
    source:body.mode==='manual'?'manual':(current.fetchedRate?'ExchangeRate-API':'preview'),
  });
  return json({exchangeRate:next});
});

export const POST=handle(async()=>{
  await requireAdminApi();
  if(!process.env.EXCHANGE_RATE_API_KEY)
    throw new HttpError(503,'Add EXCHANGE_RATE_API_KEY in Coolify before refreshing the rate.');
  try {
    return json({exchangeRate:await refreshUsdPkrRate()});
  } catch(error) {
    throw new HttpError(502,error instanceof Error?error.message:'Could not refresh USD/PKR rate.');
  }
});
