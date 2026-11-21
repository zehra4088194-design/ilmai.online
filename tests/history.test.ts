import { describe, expect, it } from 'vitest';
import { buildHistory } from '@/lib/history';
import { parseQuiz } from '@/lib/quiz';

describe('existing learning features', () => {
  it('keeps model-specific conversation history', () => {
    const rows = [
      { role: 'user' as const, content: 'Question', model: null },
      { role: 'assistant' as const, content: 'A reply', model: 'a' },
      { role: 'assistant' as const, content: 'B reply', model: 'b' },
      { role: 'assistant' as const, content: 'Quiz', model: 'b', meta: { kind: 'quiz' } },
    ];
    expect(buildHistory(rows, 'b', 5)).toEqual([{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'B reply' }]);
    expect(buildHistory(rows, 'new', 5)[1].content).toBe('A reply');
  });
  it('drops unanswered turns', () => expect(buildHistory([{ role: 'user', content: 'waiting', model: null }], 'a', 3)).toEqual([]));
  it('preserves correct quiz answers during option shuffling', () => {
    const questions = parseQuiz(JSON.stringify({ questions: [{ question: 'Two plus two?', options: ['3','4','5','6'], answer: 1 }] }), 1);
    expect(questions[0].options[questions[0].answer]).toBe('4');
  });
});
