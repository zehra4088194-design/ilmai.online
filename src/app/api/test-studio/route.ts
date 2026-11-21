import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { StudioPolicySchema } from '@/lib/test-studio';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  const flag = await requireFeature('teacher_tests', profile.plan, isAdmin);
  const { data, error } = await adminClient().from('test_papers')
    .select('id,title,status,version,counts,total_marks,config,created_at,updated_at')
    .eq('user_id', profile.id).order('updated_at', { ascending: false }).limit(50);
  if (error) throw error;
  return json({
    papers: data ?? [],
    policy: StudioPolicySchema.parse(flag.config ?? {}),
    credits: profile.credits_balance,
    isAdmin,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});
