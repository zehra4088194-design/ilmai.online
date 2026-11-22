import 'server-only';
import { unstable_cache } from 'next/cache';
import { adminClient } from '@/lib/supabase/admin';
import { fetchOrModels, type OrModel } from '@/lib/openrouter';
import type { Plan } from '@/lib/auth';
import { HttpError } from '@/lib/http';

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  context: number;
  pricePromptPerM: number;     // USD per 1M input tokens
  priceCompletionPerM: number; // USD per 1M output tokens
  pricePerRequest: number;     // USD flat fee per call (search / music / media models); NOT included in the per-token prices
  isFree: boolean;
  tier: Plan;
  enabled: boolean;
  isDefault: boolean;
  vision: boolean;
  documents: boolean;
  outputModalities: string[];
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

/** Models that are not normal chat models (music, speech, embeddings…) must never reach the chat picker, Auto routing or helper tasks. */
const NOT_CHAT = /lyria|music|\btts\b|speech|whisper|transcri|embed|rerank|moderat/i;
export const isChatCapable = (m: Pick<ModelInfo, 'id' | 'name' | 'outputModalities'>) =>
  m.outputModalities.includes('text') &&
  !m.outputModalities.some((o) => o === 'audio' || o === 'video') &&
  !NOT_CHAT.test(m.id) && !NOT_CHAT.test(m.name);

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
    pricePerRequest: Math.max(0, parseFloat(m.pricing?.request ?? '0') || 0),
    isFree: m.id.endsWith(':free') || (p === 0 && c === 0 && !(parseFloat(m.pricing?.request ?? '0') > 0)),
    tier: row?.tier ?? tierByPrice(avg),
    enabled: row?.enabled ?? true,
    isDefault: row?.is_default ?? false,
    vision: !!m.architecture?.input_modalities?.includes('image'),
    documents: !!m.architecture?.input_modalities?.some((v) => v === 'file' || v === 'pdf'),
    outputModalities: m.architecture?.output_modalities ?? ['text'],
    sort: row?.sort_order ?? 1000,
    notes: row?.notes,
  };
};

export async function getAllModels(): Promise<ModelInfo[]> {
  const [or, rows] = await Promise.all([fetchOrModels(), getRows()]);
  const byId = new Map(rows.map((r) => [r.model_id, r]));
  return or
    .map((m) => merge(m, byId.get(m.id)))
    .filter((m) => Number.isFinite(m.pricePromptPerM) && Number.isFinite(m.priceCompletionPerM) && m.pricePromptPerM >= 0 && m.priceCompletionPerM >= 0)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export async function getAllTextModels(): Promise<ModelInfo[]> {
  return (await getAllModels()).filter(isChatCapable);
}

/** Models the end user may pick (enabled only). */
export async function getUserModels(): Promise<ModelInfo[]> {
  return (await getAllTextModels()).filter((m) => m.enabled);
}

export async function getModel(id: string) {
  return (await getAllModels()).find((m) => m.id === id) ?? null;
}

export async function getDefaultModelId(): Promise<string> {
  const list = await getUserModels();
  const id = list.find((m) => m.isDefault)?.id ?? list.find((m) => m.isFree)?.id ?? list[0]?.id;
  if (!id) throw new HttpError(503, 'No enabled text models are currently available');
  return id;
}
