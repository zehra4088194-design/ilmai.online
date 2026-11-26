import { describe, expect, it } from 'vitest';
import { isChatCapable } from '@/lib/models';

describe('chat model capability filtering', () => {
  it('excludes OpenRouter batch-only variants from synchronous chat', () => {
    expect(isChatCapable({
      id: 'anthropic/claude-haiku-5.5:batch',
      name: 'Claude Haiku 5.5 (batch)',
      outputModalities: ['text'],
    })).toBe(false);
  });

  it('keeps the standard synchronous Claude Haiku model available', () => {
    expect(isChatCapable({
      id: 'anthropic/claude-haiku-5.5',
      name: 'Claude Haiku 5.5',
      outputModalities: ['text'],
    })).toBe(true);
  });

  it('keeps regular text-only Gemma chat models eligible', () => {
    expect(isChatCapable({
      id: 'google/gemma-4-31b-it:free',
      name: 'Gemma 4 31B (free)',
      outputModalities: ['text'],
    })).toBe(true);
  });
});
