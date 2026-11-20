import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { getUserModels, getDefaultModelId, canUseTier } from '@/lib/models';
import { getFeatureFlags, stateFor } from '@/lib/features';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  const [models, defaultId, flags, settings] = await Promise.all([getUserModels(), getDefaultModelId(), getFeatureFlags(), getSettings()]);
  const multiFlag = flags.find((f) => f.key === 'compare_models');
  const multi = !!multiFlag && stateFor(multiFlag, profile.plan, isAdmin) === 'active';
  return json({
    default: profile.preferred_model ?? defaultId,
    multi,
    maxParallel: multi ? Math.max(1, settings.max_parallel_models) : 1,
    models: models.map((m) => ({ ...m, locked: !isAdmin && !canUseTier(profile.plan, m.tier) })),
  });
});
