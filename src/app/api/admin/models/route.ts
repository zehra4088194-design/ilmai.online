import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: z.object({
    enabled: z.boolean().optional(),
    tier: z.enum(['free', 'pro', 'elite']).optional(),
    is_default: z.boolean().optional(),
    display_name: z.string().max(80).nullable().optional(),
    notes: z.string().max(300).nullable().optional(),
    sort_order: z.number().int().optional(),
  }),
});

/** Upserts overrides for one or many models (bulk enable/disable is just ids=[...]). */
export const PATCH = handle(async (req: NextRequest) => {
  await requireAdminApi();
  const { ids, patch } = Body.parse(await req.json());
  const db = adminClient();
  if (patch.is_default) await db.from('model_settings').update({ is_default: false }).eq('is_default', true);
  const rows = ids.map((id) => ({ model_id: id, ...patch, updated_at: new Date().toISOString() }));
  const { error } = await db.from('model_settings').upsert(rows, { onConflict: 'model_id' });
  if (error) throw error;
  revalidateTag('models');
  return json({ ok: true });
});
