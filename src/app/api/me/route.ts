import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { getAvailableCredits } from '@/lib/credits';

export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  const credits = await getAvailableCredits(profile.id);
  return json({
    id: profile.id, email: profile.email, name: profile.full_name, plan: profile.plan,
    credits, isAdmin, preferredModel: profile.preferred_model,
  });
});
