import { describe, expect, it } from 'vitest';
import {
  TestConfigSchema, parseGeneratedTest, reviseQuestions, sanitizeStudentPaper,
  validateAnswers, type TestConfig, type TestQuestion,
} from '@/lib/test-studio';

const config = (overrides: Partial<TestConfig> = {}) => TestConfigSchema.parse({
  topic: 'Photosynthesis', prompt: '', sourceIds: [], title: 'Biology test', subject: 'Biology', grade: '8',
  language: 'English', difficulty: 'medium', mcq: 1, short: 1, long: 1, duration: 60,
  marks: { mcq: 1, short: 3, long: 10 }, negativeMarking: 0, instructions: '',
  supplementSources: false, includeAnswerKey: true, includeExplanations: true, includeMarking: true,
  questionOrder: 'grouped', ...overrides,
});
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

function generated(c: TestConfig, withAnswers = true) {
  const question = (type: 'mcq'|'short'|'long', text: string, marks: number, answer?: Record<string, unknown>) => ({
    type, question: text, options: type === 'mcq' ? ['Chlorophyll', 'Glucose', 'Oxygen', 'Water'] : [],
    marks, sourceId: null, sourceReference: '', ...(withAnswers ? { answer: answer ?? {} } : {}),
  });
  return JSON.stringify({
    title: 'Photosynthesis assessment', sourceAudit: [],
    questions: [
      question('mcq', 'Which pigment absorbs light?', c.marks.mcq, {
        correctOption: 0, modelAnswer: '', explanation: 'Chlorophyll absorbs light.', markingScheme: [],
      }),
      question('short', 'Explain the role of sunlight.', c.marks.short, {
        correctOption: null, modelAnswer: 'It supplies energy for the process.',
        explanation: 'Light energy drives photosynthesis.',
        markingScheme: [{ point: 'Explains that light supplies energy', marks: c.marks.short }],
      }),
      question('long', 'Describe photosynthesis.', c.marks.long, {
        correctOption: null, modelAnswer: 'Plants convert light energy into chemical energy.',
        explanation: 'The process stores energy in glucose.',
        markingScheme: [{ point: 'Accurate explanation of the process', marks: c.marks.long }],
      }),
    ],
  });
}

describe('Test Studio generation validation', () => {
  it('parses exact question counts and a separate answer key', () => {
    const c = config();
    const result = parseGeneratedTest(generated(c), c, (() => { let n = 0; return () => id(++n); })());
    expect(result.questions.map((q) => q.type)).toEqual(['mcq', 'short', 'long']);
    expect(result.answers).toHaveLength(3);
    validateAnswers(result.questions, result.answers, c);
  });

  it('does not require or emit answer rows when answer keys are disabled', () => {
    const c = config({ includeAnswerKey: false });
    const result = parseGeneratedTest(generated(c, false), c, (() => { let n = 10; return () => id(++n); })());
    expect(result.questions).toHaveLength(3);
    expect(result.answers).toEqual([]);
  });

  it('mixes question types when requested while preserving all counts', () => {
    const c = config({ mcq: 2, short: 1, long: 1, questionOrder: 'mixed' });
    const value = JSON.stringify({
      title: 'Mixed paper', sourceAudit: [],
      questions: [
        { type: 'mcq', question: 'MCQ one?', options: ['A','B','C','D'], marks: 1, sourceId: null, sourceReference: '', answer: { correctOption: 0, modelAnswer: '', explanation: 'Because', markingScheme: [] } },
        { type: 'short', question: 'Short one?', options: [], marks: 3, sourceId: null, sourceReference: '', answer: { correctOption: null, modelAnswer: 'Answer', explanation: 'Because', markingScheme: [{ point: 'Point', marks: 3 }] } },
        { type: 'long', question: 'Long one?', options: [], marks: 10, sourceId: null, sourceReference: '', answer: { correctOption: null, modelAnswer: 'Long answer', explanation: 'Because', markingScheme: [{ point: 'Point', marks: 10 }] } },
        { type: 'mcq', question: 'MCQ two?', options: ['E','F','G','H'], marks: 1, sourceId: null, sourceReference: '', answer: { correctOption: 1, modelAnswer: '', explanation: 'Because', markingScheme: [] } },
      ],
    });
    const result = parseGeneratedTest(value, c, (() => { let n = 20; return () => id(++n); })());
    expect(result.questions.map((q) => q.type)).toEqual(['mcq', 'short', 'long', 'mcq']);
  });

  it('rejects duplicate, incomplete or mismarked model output', () => {
    const c = config();
    const value = JSON.parse(generated(c));
    value.questions[1].question = value.questions[0].question;
    expect(() => parseGeneratedTest(JSON.stringify(value), c, () => id(40))).toThrow(/Duplicate/);
    const incomplete = JSON.parse(generated(c));
    incomplete.questions.pop();
    expect(() => parseGeneratedTest(JSON.stringify(incomplete), c, (() => { let n = 41; return () => id(n++); })())).toThrow(/counts/);
    const mismarked = JSON.parse(generated(c));
    mismarked.questions[0].marks = 5;
    expect(() => parseGeneratedTest(JSON.stringify(mismarked), c, () => id(42))).toThrow(/marks/);
  });

  it('requires source audit for every selected file and rejects unreadable sources', () => {
    const c = config({ sourceIds: [id(90)] });
    const value = JSON.parse(generated(c));
    expect(() => parseGeneratedTest(JSON.stringify(value), c, () => id(43))).toThrow(/verify all supplied sources/);
    value.sourceAudit = [{ sourceId: id(90), readable: false, note: 'Scanned page is unreadable' }];
    expect(() => parseGeneratedTest(JSON.stringify(value), c, () => id(44))).toThrow(/unreadable/);
  });

  it('increments a stable question revision only when its content changes', () => {
    const before: TestQuestion[] = [{ id: id(50), revision: 1, type: 'short', question: 'Explain cells.', options: [], marks: 3, sourceReference: '' }];
    const same = reviseQuestions(before, [{ ...before[0] }], []);
    expect(same[0].id).toBe(before[0].id);
    expect(same[0].revision).toBe(1);
    const changed = reviseQuestions(before, [{ ...before[0], question: 'Explain plant cells.' }], []);
    expect(changed[0].id).toBe(before[0].id);
    expect(changed[0].revision).toBe(2);
  });

  it('exposes a strict question-only student paper', () => {
    const c = config();
    const result = parseGeneratedTest(generated(c), c, (() => { let n = 60; return () => id(++n); })());
    const paper = sanitizeStudentPaper({ id: id(70), version: 1, config: c, questions: result.questions });
    expect(paper.questions[0]).not.toHaveProperty('answer');
    expect(paper.questions[0]).not.toHaveProperty('correctOption');
    expect(paper.questions).toHaveLength(3);
  });
});
