import 'server-only';
import { unstable_cache } from 'next/cache';
import { adminClient } from '@/lib/supabase/admin';

export type Mode = {
  id: string;
  slug: string;
  audience: 'student' | 'teacher' | 'both';
  name: string;
  name_ur: string | null;
  icon: string;
  description: string;
  system_prompt: string;
  starters: string[];
  tool: string | null;
  is_active: boolean;
  sort_order: number;
};

/** Active modes (cached, tag 'modes'). The admin panel revalidates this tag. */
export const getModes = unstable_cache(
  async (): Promise<Mode[]> => {
    try {
      const { data } = await adminClient().from('modes').select('*').eq('is_active', true).order('sort_order');
      return (data ?? []) as Mode[];
    } catch {
      return [];
    }
  },
  ['modes'],
  { tags: ['modes'], revalidate: 60 },
);

export async function getMode(slug: string | null | undefined) {
  if (!slug) return null;
  return (await getModes()).find((m) => m.slug === slug) ?? null;
}
