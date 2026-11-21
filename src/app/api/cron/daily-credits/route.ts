import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Call once a day:  curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/daily-credits */
export async function GET(req: NextRequest) {
  if (!env.cronSecret || req.headers.get('authorization') !== `Bearer ${env.cronSecret}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await adminClient().rpc('grant_daily_credits');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ topped_up: data });
}
