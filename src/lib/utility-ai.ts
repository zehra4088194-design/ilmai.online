import 'server-only';
import { getSettings } from '@/lib/settings';
import { getAllTextModels } from '@/lib/models';
import { orChat } from '@/lib/openrouter';
import { HttpError } from '@/lib/http';

/** Preferred families for background tasks (suggestions, quizzes). Lower index = better. */
const PREFER = [/gpt-oss/i, /llama-?(3\.3|4)/i, /gemma-?3/i, /qwen/i, /deepseek-(chat|v3)/i, /mistral/i, /gemma/i, /llama/i];
const AVOID = /r1|reason|think|vision|guard|embed|coder|:extended/i;

/** Models used for "free" utility work. Admin can pin them with the `utility_models` setting (comma separated). */
export async function getUtilityModels(limit = 3): Promise<string[]> {
  const s = await getSettings();
  const manual = s.utility_models.split(',').map((x) => x.trim()).filter(Boolean);
  let free: { id: string; context: number }[] = [];
  try {
    free = (await getAllTextModels()).filter((m) => m.enabled && m.isFree && m.context >= 8000 && !AVOID.test(m.id));
  } catch { /* catalogue unavailable */ }
  const rank = (id: string) => { const i = PREFER.findIndex((r) => r.test(id)); return i === -1 ? 99 : i; };
  free.sort((a, b) => rank(a.id) - rank(b.id) || b.context - a.context);
  const ids = manual.length ? manual.filter((id) => free.some((m) => m.id === id)).slice(0, limit + 2) : free.slice(0, limit).map((m) => m.id);
  if (!ids.length) throw new HttpError(503, 'No enabled free utility models are available', 'utility_unavailable');
  return ids;
}

export type UtilityResult = { text: string; model: string; cost: number; promptTokens: number; completionTokens: number };

/** Tries each utility model in order until one answers. Free models are rate-limited, so fall-through matters. */
export async function utilityChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number; tries?: number; startAt?: number } = {},
): Promise<UtilityResult> {
  const all = await getUtilityModels(opts.tries ?? 3);
  const rot = (opts.startAt ?? 0) % all.length;
  const models = [...all.slice(rot), ...all.slice(0, rot)]; // rotate so a retry starts with a different model
  for (const model of models) {
    try {
      const r = await orChat(
        { model, messages, max_tokens: opts.maxTokens ?? 500, temperature: opts.temperature ?? 0.6 },
        AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      );
      const text = r.choices?.[0]?.message?.content?.trim();
      if (text) {
        return { text, model, cost: r.usage?.cost ?? 0, promptTokens: r.usage?.prompt_tokens ?? 0, completionTokens: r.usage?.completion_tokens ?? 0 };
      }
    } catch (e) {
      console.warn(`[utility] ${model} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw new HttpError(503, 'The free AI models are busy right now. Please try again in a moment.', 'utility_unavailable');
}
