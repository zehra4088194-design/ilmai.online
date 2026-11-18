import 'server-only';
import { unstable_cache } from 'next/cache';
import { adminClient } from '@/lib/supabase/admin';
import { fetchOrModels, type OrModel } from '@/lib/openrouter';
import type { Plan } from '@/lib/auth';

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  context: number;
  pricePromptPerM: number;     // USD per 1M input tokens
  priceCompletionPerM: number; // USD per 1M output tokens
  isFree: boolean;
  tier: Plan;
  enabled: boolean;
  isDefault: boolean;
  vision: boolean;
  sort: number;
  notes?: string | null;
};

export const tierByPrice = (perM: number): Plan => (perM < 1.5 ? 'free' : perM < 12 ? 'pro' : 'elite');
const RANK: Record<Plan, number> = { free: 0, pro: 1, elite: 2 };
export const canUseTier = (plan: Plan, tier: Plan) => RANK[plan] >= RANK[tier];

type Row = { model_id: string; enabled: boolean; display_name: string | null; tier: Plan; is_default: boolean; sort_order: number; notes: string | null };

const getRows = unstable_cache(
  async (): Promise<Row[]> => {
    try {
      const { data } = await adminClient().from('model_settings').select('*');
      return (data ?? []) as Row[];
    } catch {
      return [];
    }
  },
  ['model-settings'],
  { tags: ['models'], revalidate: 30 },
);

const merge = (m: OrModel, row?: Row): ModelInfo => {
  const p = parseFloat(m.pricing?.prompt ?? '0') * 1e6;
  const c = parseFloat(m.pricing?.completion ?? '0') * 1e6;
  const avg = (p + c) / 2;
  return {
    id: m.id,
    name: row?.display_name || m.name,
    provider: m.id.split('/')[0],
    context: m.context_length ?? 0,
    pricePromptPerM: p,
    priceCompletionPerM: c,
    isFree: m.id.endsWith(':free') || (p === 0 && c === 0),
    tier: row?.tier ?? tierByPrice(avg),
    enabled: row?.enabled ?? true,
    isDefault: row?.is_default ?? false,
    vision: !!m.architecture?.input_modalities?.includes('image'),
    sort: row?.sort_order ?? 1000,
    notes: row?.notes,
  };
};

/** All text-output models, merged with admin overrides. */
export async function getAllTextModels(): Promise<ModelInfo[]> {
  const [or, rows] = await Promise.all([fetchOrModels(), getRows()]);
  const byId = new Map(rows.map((r) => [r.model_id, r]));
  return or
    .filter((m) => (m.architecture?.output_modalities ?? ['text']).includes('text'))
    .map((m) => merge(m, byId.get(m.id)))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Models the end user may pick (enabled only). */
export async function getUserModels(): Promise<ModelInfo[]> {
  return (await getAllTextModels()).filter((m) => m.enabled);
}

export async function getModel(id: string) {
  return (await getAllTextModels()).find((m) => m.id === id) ?? null;
}

export async function getDefaultModelId(): Promise<string> {
  const list = await getUserModels();
  return list.find((m) => m.isDefault)?.id ?? list.find((m) => m.isFree)?.id ?? list[0]?.id ?? 'openai/gpt-4o-mini';
}
