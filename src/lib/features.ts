import 'server-only';
import { unstable_cache } from 'next/cache';
import { adminClient } from '@/lib/supabase/admin';
import { HttpError } from '@/lib/http';
import type { Plan } from '@/lib/auth';

export type FeatureKey =
  | 'text_chat' | 'compare_models' | 'image_generation' | 'video_generation'
  | 'presentations' | 'teacher_tests' | 'file_upload' | 'web_search' | 'voice_input';

export type FeatureFlag = {
  key: FeatureKey | string;
  label: string;
  description: string;
  icon: string;
  enabled: boolean;
  visible: boolean;
  coming_soon: boolean;
  min_plan: Plan;
  sort_order: number;
  config: Record<string, unknown>;
};

/** What the user's UI needs to know about each feature. */
export type FeatureState = 'active' | 'locked_plan' | 'coming_soon' | 'hidden';
export type UserFeature = FeatureFlag & { state: FeatureState };

const RANK: Record<Plan, number> = { free: 0, pro: 1, elite: 2 };

export const getFeatureFlags = unstable_cache(
  async (): Promise<FeatureFlag[]> => {
    try {
      const { data } = await adminClient().from('feature_flags').select('*').order('sort_order');
      return (data ?? []) as FeatureFlag[];
    } catch {
      return [];
    }
  },
  ['feature-flags'],
  { tags: ['flags'], revalidate: 30 },
);

export function stateFor(f: FeatureFlag, plan: Plan, isAdmin: boolean): FeatureState {
  if (isAdmin) return 'active'; // admins can test everything
  if (!f.visible && !f.enabled) return 'hidden';
  if (!f.visible) return 'hidden';
  if (f.coming_soon || !f.enabled) return 'coming_soon';
  if (RANK[plan] < RANK[f.min_plan]) return 'locked_plan';
  return 'active';
}

export async function featuresForUser(plan: Plan, isAdmin: boolean): Promise<UserFeature[]> {
  const flags = await getFeatureFlags();
  return flags.map((f) => ({ ...f, state: stateFor(f, plan, isAdmin) })).filter((f) => f.state !== 'hidden');
}

/** Use at the top of any API route that implements a feature. */
export async function requireFeature(key: FeatureKey, plan: Plan, isAdmin: boolean) {
  const flags = await getFeatureFlags();
  const f = flags.find((x) => x.key === key);
  if (!f) throw new HttpError(404, `Unknown feature: ${key}`);
  if (isAdmin) return f;
  if (!f.enabled || f.coming_soon) throw new HttpError(403, `${f.label} is not available right now`, 'feature_disabled');
  if (RANK[plan] < RANK[f.min_plan]) throw new HttpError(403, `${f.label} needs the ${f.min_plan} plan`, 'plan_required');
  return f;
}
