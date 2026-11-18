import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  return json({
    id: profile.id, email: profile.email, name: profile.full_name, plan: profile.plan,
    credits: profile.credits_balance, isAdmin, preferredModel: profile.preferred_model,
  });
});
