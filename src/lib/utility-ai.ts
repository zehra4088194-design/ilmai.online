import 'server-only';
import { getSettings } from '@/lib/settings';
import { getAllTextModels, type ModelInfo } from '@/lib/models';
import { aiRouterChat } from '@/lib/ai-router';
import { HttpError } from '@/lib/http';

/** Preferred families for background tasks (suggestions, quizzes and prompt enhancement). */
const PREFER = [
  /nemotron/i, /ernie/i, /ling-3/i, /gpt-oss/i, /gemma-?4/i,
  /llama-?(3\.3|4)/i, /qwen/i, /deepseek/i, /mistral/i,
  /gemini.*flash/i, /haiku/i, /mini/i, /gemma/i, /llama/i,
];
const AVOID = /r1|reason|think|vision|guard|embed|coder|:extended|image|audio|search|sonar|opus|pro-?preview/i;

/**
 * The maximum average token price for paid safety-net models, in USD per 1M tokens.
 * Utility prompts are small, so these models cost only a tiny fraction of a cent per call.
 */
const CHEAP_FALLBACK_MAX_PER_M = 0.6;
const OPENROUTER_FREE_ROUTER = 'openrouter/free';

const rank = (id: string) => {
  const i = PREFER.findIndex((r) => r.test(id));
  return i === -1 ? 99 : i;
};
const avgPrice = (m: ModelInfo) => (m.pricePromptPerM + m.priceCompletionPerM) / 2;
const hasRequestFee = (m: ModelInfo) => m.pricePerRequest > 0;

/**
 * Utility candidates, ordered deliberately so a long list of free models cannot
 * crowd out the paid safety net:
 *  1. Admin-pinned IDs (including OpenRouter's dynamic openrouter/free alias).
 *  2. The two best enabled free text models from the live catalogue.
 *  3. Up to three enabled, very cheap paid text models.
 *
 * Manual IDs are checked against the live catalogue whenever it is available.
 */
export async function getUtilityModels(): Promise<string[]> {
  const settings = await getSettings();
  const manual = (settings.utility_models ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  let usable: ModelInfo[] = [];
  try {
    usable = (await getAllTextModels()).filter(
      (model) => model.enabled && model.context >= 8000 && !AVOID.test(model.id) && !hasRequestFee(model),
    );
  } catch {
    // Catalogue may temporarily be unavailable. Admin-pinned IDs can still be tried.
  }

  const known = new Set(usable.map((model) => model.id));
  const pinned = manual.filter((id) => id === OPENROUTER_FREE_ROUTER || !usable.length || known.has(id));

  const free = usable
    .filter((model) => model.isFree)
    .sort((a, b) => rank(a.id) - rank(b.id) || b.context - a.context)
    .slice(0, 2)
    .map((model) => model.id);

  const cheap = usable
    .filter((model) => !model.isFree && avgPrice(model) > 0 && avgPrice(model) <= CHEAP_FALLBACK_MAX_PER_M)
    .sort((a, b) => rank(a.id) - rank(b.id) || avgPrice(a) - avgPrice(b))
    .slice(0, 3)
    .map((model) => model.id);

  const ids = [...new Set([...pinned, ...free, ...cheap])];
  if (!ids.length) {
    throw new HttpError(
      503,
      'No enabled utility models are available. Enable a free or low-cost text model in the admin panel.',
      'utility_unavailable',
    );
  }
  return ids;
}

export type UtilityResult = {
  text: string;
  model: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
};

/** Tries each candidate in order, preserving time for cheap paid fallbacks after free-model rate limits. */
export async function utilityChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: {
    userId: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    tries?: number;
    startAt?: number;
    deadlineMs?: number;
  },
): Promise<UtilityResult> {
  const all = await getUtilityModels();
  const attemptLimit = Math.max(1, Math.min(all.length, opts.tries ?? 4));
  const rot = ((opts.startAt ?? 0) % all.length + all.length) % all.length;
  const models = [...all.slice(rot), ...all.slice(0, rot)].slice(0, attemptLimit);

  const perCall = opts.timeoutMs ?? 20_000;
  const startedAt = Date.now();
  const deadline = opts.deadlineMs ?? Math.min(perCall * attemptLimit, 60_000);
  let lastError = '';

  for (const model of models) {
    const remaining = deadline - (Date.now() - startedAt);
    if (remaining < 2_500) break;

    try {
      const response = await aiRouterChat({
        userId: opts.userId,
        model,
        messages,
        max_tokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0.6,
        timeoutMs: Math.min(perCall, remaining),
      });
      const text = response.choices?.[0]?.message?.content?.trim();
      if (text) {
        return {
          text,
          model: response.routedModel,
          cost: response.usage?.cost ?? 0,
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
        };
      }
      lastError = 'empty answer';
      console.warn('[utility] ' + model + ' returned an empty answer');
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn('[utility] ' + model + ' failed:', lastError);
    }
  }

  throw new HttpError(
    503,
    'The helper AI models are busy right now. Please try again in a moment.' +
      (lastError ? ' (' + lastError.slice(0, 120) + ')' : ''),
    'utility_unavailable',
  );
}


/** Groq is intentionally reserved for prompt enhancement, first-chat titles and comparison summaries. */
const GROQ_TASK_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];

export async function groqTaskChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string | unknown[] }[],
  opts: { userId: string; maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<UtilityResult> {
  let lastError = '';
  for (const model of GROQ_TASK_MODELS) {
    try {
      const response = await aiRouterChat({
        userId: opts.userId, model, routing: { provider: 'groq' }, messages,
        max_tokens: opts.maxTokens ?? 220,
        temperature: opts.temperature ?? 0.7,
        timeoutMs: opts.timeoutMs ?? 9000,
      });
      const text = response.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Groq returned an empty answer for ' + model);
      return {
        text, model: response.routedModel, cost: response.usage?.cost ?? 0,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn('[groq-task] ' + model + ' failed:', lastError);
    }
  }
  throw new HttpError(503, 'Groq task service is unavailable.' + (lastError ? ' (' + lastError.slice(0, 160) + ')' : ''), 'groq_task_unavailable');
}
