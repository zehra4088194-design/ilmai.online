import { describe, expect, it } from 'vitest';
import { extractJson } from '@/lib/json-extract';
import { parseQuiz } from '@/lib/quiz';

describe('extractJson', () => {
  it('extracts fenced JSON surrounded by model commentary', () => {
    const raw = 'Here is the result:\n' +
      String.fromCharCode(96).repeat(3) + 'json\n' +
      '{"questions":[{"question":"What is 2 + 2?","options":["3","4"],"answer":1}]}\n' +
      String.fromCharCode(96).repeat(3) +
      '\nDone.';
    expect(extractJson(raw)).toEqual({
      questions: [{ question: 'What is 2 + 2?', options: ['3', '4'], answer: 1 }],
    });
  });

  it('does not mistake braces inside JSON strings for structural braces', () => {
    const raw = 'Output: {"questions":[{"question":"What does {x} mean?","options":["A","B"],"answer":0}]} trailing text';
    expect(extractJson(raw)).toMatchObject({
      questions: [{ question: 'What does {x} mean?' }],
    });
  });
});

describe('parseQuiz', () => {
  it('accepts common alternate field names and maps the correct answer text', () => {
    const result = parseQuiz(JSON.stringify({
      questions: [{
        prompt: 'Which city is the capital of France?',
        choices: ['Rome', 'Berlin', 'Paris', 'Madrid'],
        correct_answer: 'Paris',
        explanation: 'Paris is the capital of France.',
      }],
    }), 10);

    expect(result).toHaveLength(1);
    expect(result[0].options[result[0].answer]).toBe('Paris');
    expect(result[0].type).toBe('mcq');
  });

  it('accepts letter-style answer indices and shuffles without losing the answer', () => {
    const result = parseQuiz(JSON.stringify([{
      type: 'mcq',
      question: 'Which number is even?',
      options: ['3', '5', '8', '9'],
      answer: 'C',
    }]), 1);

    expect(result).toHaveLength(1);
    expect(result[0].options[result[0].answer]).toBe('8');
  });

  it('normalises true/false questions that return a boolean answer', () => {
    const result = parseQuiz(JSON.stringify({
      questions: [{
        type: 'tf',
        question: 'The Earth orbits the Sun.',
        answer: true,
        explanation: 'Earth follows an orbit around the Sun.',
      }],
    }), 1);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tf');
    expect(result[0].options[result[0].answer]).toBe('True');
  });

  it('drops duplicate questions, duplicate choices and invalid answer indexes', () => {
    const result = parseQuiz(JSON.stringify({ questions: [
      { question: 'Repeated question?', options: ['A', 'B'], answer: 1 },
      { question: ' repeated   question? ', options: ['A', 'B'], answer: 1 },
      { question: 'Duplicate choices?', options: ['A', 'A'], answer: 0 },
      { question: 'Bad answer index?', options: ['A', 'B'], answer: 5 },
    ] }), 10);

    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('Repeated question?');
  });
});
