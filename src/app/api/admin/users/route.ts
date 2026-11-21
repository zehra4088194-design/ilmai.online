import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireAdminApi } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { addCredits } from '@/lib/credits';

export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'admin']).optional(),
  plan: z.enum(['free', 'pro', 'elite']).optional(),
  is_banned: z.boolean().optional(),
  creditsDelta: z.number().int().min(-1_000_000).max(10_000_000).optional(),
});

export const PATCH = handle(async (req: NextRequest) => {
  const { user } = await requireAdminApi();
  const { id, creditsDelta, ...patch } = Body.parse(await req.json());
  if (id === user.id && (patch.role === 'user' || patch.is_banned))
    throw new HttpError(400, "You can't demote or ban yourself");
  if (Object.keys(patch).length) {
    const { error } = await adminClient().from('profiles').update(patch).eq('id', id);
    if (error) throw error;
  }
  if (creditsDelta) await addCredits(id, creditsDelta, `admin:${user.email ?? user.id}`);
  return json({ ok: true });
});
