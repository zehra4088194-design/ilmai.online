import 'server-only';
import { getSettings } from '@/lib/settings';
import { getAllTextModels, type ModelInfo } from '@/lib/models';
import { aiRouterChat } from '@/lib/ai-router';
import { HttpError } from '@/lib/http';

/** Preferred families for background tasks (suggestions, quizzes). Lower index = better. */
const PREFER = [/gpt-oss/i, /llama-?(3\.3|4)/i, /gemma-?[34]/i, /qwen/i, /deepseek/i, /mistral/i, /gemini.*flash/i, /haiku/i, /mini/i, /gemma/i, /llama/i];
const AVOID = /r1|reason|think|vision|guard|embed|coder|:extended|image|audio|search|sonar|opus|pro-?preview/i;

/**
 * If no FREE model is usable, fall back to very cheap paid models (average price per 1M tokens at or below this, in USD).
 * Utility calls are short (a few hundred tokens) so each one costs a tiny fraction of a cent, and users are never charged.
 */
const CHEAP_FALLBACK_MAX_PER_M = 0.6;

const rank = (id: string) => { const i = PREFER.findIndex((r) => r.test(id)); return i === -1 ? 99 : i; };
const avgPrice = (m: ModelInfo) => (m.pricePromptPerM + m.priceCompletionPerM) / 2;
/** Per-call fees (web-search models, music/media models) make a model unsuitable for background work. */
const hasRequestFee = (m: ModelInfo) => m.pricePerRequest > 0;

/**
 * Models used for background utility work, best first:
 *  1. models pinned by the admin in the `utility_models` setting (comma separated; free or paid),
 *  2. enabled FREE models,
 *  3. enabled very cheap paid models (safety net, so suggestions / quizzes / enhance keep working when free models are down).
 */
export async function getUtilityModels(limit = 3): Promise<string[]> {
  const s = await getSettings();
  const manual = (s.utility_models ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  let usable: ModelInfo[] = [];
  try {
    usable = (await getAllTextModels()).filter((m) => m.enabled && m.context >= 8000 && !AVOID.test(m.id) && !hasRequestFee(m));
  } catch { /* catalogue unavailable */ }

  const known = new Set(usable.map((m) => m.id));
  const pinned = usable.length ? manual.filter((id) => known.has(id)) : manual; // no catalogue -> trust the admin's list
  const free = usable.filter((m) => m.isFree).sort((a, b) => rank(a.id) - rank(b.id) || b.context - a.context).map((m) => m.id);
  const cheap = usable
    .filter((m) => !m.isFree && avgPrice(m) > 0 && avgPrice(m) <= CHEAP_FALLBACK_MAX_PER_M)
    .sort((a, b) => rank(a.id) - rank(b.id) || avgPrice(a) - avgPrice(b))
    .map((m) => m.id);

  const ids = [...new Set([...pinned, ...free, ...cheap])].slice(0, Math.max(limit, 1) + 3);
  if (!ids.length) throw new HttpError(503, 'No enabled utility models are available. Enable at least one cheap or free text model in the admin panel.', 'utility_unavailable');
  return ids;
}

export type UtilityResult = { text: string; model: string; cost: number; promptTokens: number; completionTokens: number };

/** Tries each utility model in order until one answers. Free models are rate-limited, so fall-through matters. */
export async function utilityChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { userId: string; maxTokens?: number; temperature?: number; timeoutMs?: number; tries?: number; startAt?: number; deadlineMs?: number },
): Promise<UtilityResult> {
  const all = await getUtilityModels(opts.tries ?? 3);
  const rot = (opts.startAt ?? 0) % all.length;
  const models = [...all.slice(rot), ...all.slice(0, rot)]; // rotate so a retry starts with a different model
  const perCall = opts.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  const deadline = opts.deadlineMs ?? Math.min(perCall * 2, 50_000); // stay inside the route's maxDuration
  let lastError = '';
  for (const model of models) {
    const remaining = deadline - (Date.now() - startedAt);
    if (remaining < 4_000) break;
    try {
      const r = await aiRouterChat({
        userId: opts.userId, model, messages, max_tokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0.6, timeoutMs: Math.min(perCall, remaining),
      });
      const text = r.choices?.[0]?.message?.content?.trim();
      if (text) {
        return { text, model: r.routedModel, cost: r.usage?.cost ?? 0, promptTokens: r.usage?.prompt_tokens ?? 0, completionTokens: r.usage?.completion_tokens ?? 0 };
      }
      lastError = 'empty answer';
      console.warn(`[utility] ${model} returned an empty answer`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[utility] ${model} failed:`, lastError);
    }
  }
  throw new HttpError(503, 'The helper AI models are busy right now. Please try again in a moment.' + (lastError ? ` (${lastError.slice(0, 120)})` : ''), 'utility_unavailable');
}
