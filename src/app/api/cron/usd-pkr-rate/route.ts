import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { refreshUsdPkrRate } from '@/lib/exchange-rate';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest) {
  if(!env.cronSecret || req.headers.get('authorization')!==`Bearer ${env.cronSecret}`)
    return Response.json({error:'Unauthorized'},{status:401});

  try {
    const rate=await refreshUsdPkrRate();
    return Response.json({
      status:'success',rate:rate.usdToPkr,fetchedRate:rate.fetchedRate,
      fetchedAt:rate.fetchedAt,lastUpdated:rate.lastUpdated,mode:rate.mode,
    });
  } catch(error) {
    const message=error instanceof Error?error.message:'Could not refresh USD/PKR rate.';
    return Response.json({status:env.exchangeRateApiKey?'fallback':'not_configured',error:message},{status:503});
  }
}
