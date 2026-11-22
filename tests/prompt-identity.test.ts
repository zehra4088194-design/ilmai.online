import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/prompt';
import { cleanModelName, providerFromModelId, providerKey, providerLogoSources, providerName } from '@/lib/provider-meta';
import { fallbackSuggestions } from '@/lib/suggestions-fallback';
import type { AppSettings } from '@/lib/settings';

const settings = {
  system_prompt: 'You are Ilm AI, a helpful assistant for students. Reply in the same language the user writes in.',
} as AppSettings;

describe('model identity in the system prompt', () => {
  it('tells each model its real name and maker, and drops the old "You are Ilm AI" line', () => {
    const prompt = buildSystemPrompt({ settings, model: { id: '~anthropic/claude-haiku-latest', name: 'Anthropic: Claude Haiku Latest', provider: '~anthropic' } });
    expect(prompt).toContain('Claude Haiku Latest');
    expect(prompt).toContain('Anthropic');
    expect(prompt).not.toMatch(/You are Ilm AI/);
    expect(prompt).toContain('Reply in the same language');
  });

  it('works for Auto routing (no fixed model)', () => {
    const prompt = buildSystemPrompt({ settings, model: null });
    expect(prompt).toContain('real model name');
    expect(prompt).not.toMatch(/You are Ilm AI/);
  });
});

describe('provider helpers', () => {
  it('treats "~anthropic" and "anthropic" as the same provider', () => {
    expect(providerKey('~Anthropic')).toBe('anthropic');
    expect(providerFromModelId('~openai/gpt-luna-latest')).toBe('openai');
    expect(providerName('~deepseek')).toBe('DeepSeek');
    expect(providerFromModelId('auto')).toBe('');
  });

  it('removes the "Provider: " prefix from model names', () => {
    expect(cleanModelName('OpenAI: GPT Luna Latest')).toBe('GPT Luna Latest');
    expect(cleanModelName('Sonar')).toBe('Sonar');
  });

  it('resolves separate light and dark assets before the previous shared logo', () => {
    expect(providerLogoSources('~google', 'light')[0]).toBe('/providers/google-light.svg');
    expect(providerLogoSources('~google', 'dark')[0]).toBe('/providers/google-dark.svg');
    expect(providerLogoSources('~google', 'light')[3]).toBe('/providers/google.svg');
    expect(providerLogoSources('../etc')).toEqual([]);
  });
});

describe('offline suggestion fallback', () => {
  it('matches the user language', () => {
    expect(fallbackSuggestions('mujhe fraction samjhao')[0]).toMatch(/samjhao/i);
    expect(fallbackSuggestions('اسے سمجھائیں')[0]).toMatch(/[\u0600-\u06FF]/);
    expect(fallbackSuggestions('hello there')[0]).toMatch(/simpler/i);
  });
});
