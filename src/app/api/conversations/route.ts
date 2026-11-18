import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  await requireUserApi();
  const supabase = await createClient(); // RLS: only own rows
  const { data, error } = await supabase
    .from('conversations').select('id,title,model,pinned,updated_at')
    .eq('archived', false).order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(200);
  if (error) throw error;
  return json({ conversations: data });
});
