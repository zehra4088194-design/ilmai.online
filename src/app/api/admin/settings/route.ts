import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { DEFAULT_SETTINGS } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const Body = z.object({ key: z.string(), value: z.unknown() });

export const PATCH = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { key, value } = Body.parse(await req.json());
  if (!(key in DEFAULT_SETTINGS)) throw new HttpError(400, `Unknown setting: ${key}`);
  const expected = typeof (DEFAULT_SETTINGS as Record<string, unknown>)[key];
  if (typeof value !== expected) throw new HttpError(400, `Setting ${key} must be of type ${expected}`);
  const { error } = await adminClient().from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  revalidateTag('settings');
  return json({ ok: true });
});
