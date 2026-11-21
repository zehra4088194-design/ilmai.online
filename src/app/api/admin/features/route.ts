import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  key: z.string(),
  patch: z.object({
    label: z.string().min(1).max(80).optional(),
    description: z.string().max(300).optional(),
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    coming_soon: z.boolean().optional(),
    min_plan: z.enum(['free', 'pro', 'elite']).optional(),
    config: z.record(z.unknown()).optional(),
  }),
});

export const PATCH = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { key, patch } = Body.parse(await req.json());
  const { error } = await adminClient().from('feature_flags').update({ ...patch, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw error;
  revalidateTag('flags');
  return json({ ok: true });
});
