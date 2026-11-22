/**
 * Client-safe helpers for AI providers (no server-only imports).
 *
 * OpenRouter model ids look like "anthropic/claude-haiku-latest" or "~anthropic/claude-haiku-latest"
 * (the "~" prefix marks an "always latest" alias). The provider KEY is the part before the slash with
 * the "~" removed, so "~anthropic" and "anthropic" are one and the same provider.
 *
 * Logo files live in /public/providers/<providerKey>.svg (or .png / .webp), e.g.
 *   public/providers/anthropic.svg   public/providers/deepseek.svg   public/providers/openai.svg
 */

const PROVIDER_NAMES: Record<string, string> = {
  'ai router': 'Ilm AI Auto',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  perplexity: 'Perplexity',
  deepseek: 'DeepSeek',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  qwen: 'Qwen',
  'x-ai': 'xAI',
  cohere: 'Cohere',
  amazon: 'Amazon',
  microsoft: 'Microsoft',
  nvidia: 'NVIDIA',
  moonshotai: 'Moonshot AI',
  minimax: 'MiniMax',
  'z-ai': 'Z.AI',
  bytedance: 'ByteDance',
  ai21: 'AI21',
  writer: 'Writer',
  nousresearch: 'Nous Research',
  'arcee-ai': 'Arcee AI',
  liquid: 'Liquid AI',
};

/** "~Anthropic" / "anthropic" -> "anthropic". */
export function providerKey(provider: string | null | undefined): string {
  return (provider ?? '').trim().replace(/^~+/, '').toLowerCase();
}

/** Provider key taken from a model id ("~openai/gpt-x" -> "openai"). */
export function providerFromModelId(modelId: string | null | undefined): string {
  if (!modelId || !modelId.includes('/')) return '';
  return providerKey(modelId.split('/')[0]);
}

export function providerName(provider: string | null | undefined): string {
  const key = providerKey(provider);
  if (!key) return '';
  return PROVIDER_NAMES[key] ?? key.split(/[-_\s]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

/** "Anthropic: Claude Haiku Latest" -> "Claude Haiku Latest". */
export function cleanModelName(name: string | null | undefined): string {
  return (name ?? '').replace(/^[^:]+:\s*/, '').replace(/\s*\(free\)\s*$/i, '').trim();
}

/** Candidate logo files for a provider, tried in order until one loads. */
export function providerLogoSources(provider: string | null | undefined): string[] {
  const key = providerKey(provider);
  if (!key || !/^[a-z0-9._-]+$/.test(key)) return [];
  return ['svg', 'png', 'webp'].map((ext) => `/providers/${key}.${ext}`);
}
