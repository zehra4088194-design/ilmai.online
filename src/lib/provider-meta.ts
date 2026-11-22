/**
 * Client-safe helpers for AI providers (no server-only imports).
 *
 * OpenRouter model ids look like "anthropic/claude-haiku-latest" or "~anthropic/claude-haiku-latest".
 * Provider logos are stored in public/providers using <provider>-light / <provider>-dark variants.
 * Existing <provider>.<ext> files remain supported as a backwards-compatible fallback.
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

export type ProviderLogoTheme = 'light' | 'dark';

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
  return PROVIDER_NAMES[key] ?? key
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function cleanModelName(name: string | null | undefined): string {
  return (name ?? '').replace(/^[^:]+:\s*/, '').replace(/\s*\(free\)\s*$/i, '').trim();
}

/**
 * Returns theme-specific assets first, then the old shared logo as a fallback.
 * SVG is preferred; PNG and WebP are accepted as alternatives.
 */
export function providerLogoSources(
  provider: string | null | undefined,
  theme: ProviderLogoTheme = 'light',
): string[] {
  const key = providerKey(provider);
  if (!key || !/^[a-z0-9._-]+$/.test(key)) return [];

  const extensions = ['svg', 'png', 'webp'];
  const themed = extensions.map((extension) => '/providers/' + key + '-' + theme + '.' + extension);
  const legacy = extensions.map((extension) => '/providers/' + key + '.' + extension);
  return [...themed, ...legacy];
}
