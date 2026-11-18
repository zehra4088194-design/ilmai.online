import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { featuresForUser } from '@/lib/features';

export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  return json({ features: await featuresForUser(profile.plan, isAdmin) });
});
