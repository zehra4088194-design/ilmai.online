import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { getUserModels, getDefaultModelId, canUseTier } from '@/lib/models';

export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  const [models, defaultId] = await Promise.all([getUserModels(), getDefaultModelId()]);
  return json({
    default: profile.preferred_model ?? defaultId,
    models: models.map((m) => ({ ...m, locked: !isAdmin && !canUseTier(profile.plan, m.tier) })),
  });
});
