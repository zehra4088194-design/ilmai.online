import 'server-only';
import { unstable_cache } from 'next/cache';
import { adminClient } from '@/lib/supabase/admin';

export type AppSettings = {
  site_name: string;
  signups_enabled: boolean;
  maintenance_mode: boolean;
  announcement: { enabled: boolean; text: string };
  default_credits: number;
  daily_free_credits: number;
  credits_per_usd: number;
  min_credits_per_msg: number;
  max_history_messages: number;
  max_upload_mb: number;
  system_prompt: string;
  max_parallel_models: number;
  utility_models: string;
  suggestions_per_day: number;
  quizzes_per_day: number;
  quiz_max_questions: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  site_name: 'Ilm AI',
  signups_enabled: true,
  maintenance_mode: false,
  announcement: { enabled: false, text: '' },
  default_credits: 500,
  daily_free_credits: 100,
  credits_per_usd: 10000,
  min_credits_per_msg: 1,
  max_history_messages: 30,
  max_upload_mb: 15,
  system_prompt: 'You are Ilm AI, a helpful assistant.',
  max_parallel_models: 4,
  utility_models: '',
  suggestions_per_day: 300,
  quizzes_per_day: 40,
  quiz_max_questions: 20,
};

export const getSettings = unstable_cache(
  async (): Promise<AppSettings> => {
    try {
      const { data } = await adminClient().from('app_settings').select('key,value');
      const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
      (data ?? []).forEach((r: { key: string; value: unknown }) => (out[r.key] = r.value));
      return out as AppSettings;
    } catch {
      return DEFAULT_SETTINGS; // DB not configured yet
    }
  },
  ['app-settings'],
  { tags: ['settings'], revalidate: 60 },
);
