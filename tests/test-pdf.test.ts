import { describe, expect, it } from 'vitest';
import { buildTestDocumentHtml, questionPaperHtml, answerKeyHtml, teacherCopyHtml } from '@/lib/test-pdf';
import type { StudentPaper, TestAnswer } from '@/lib/test-studio';

const questionId = '00000000-0000-4000-8000-000000000001';
const paper: StudentPaper = {
  id: '00000000-0000-4000-8000-000000000010',
  version: 3, totalMarks: 1, counts: { mcq: 1, short: 0, long: 0 },
  config: {
    topic: 'Energy', prompt: '', sourceIds: [], title: 'Energy & <Safety>', subject: 'Physics', grade: '9',
    language: 'Urdu', difficulty: 'medium', mcq: 1, short: 0, long: 0, duration: 30,
    marks: { mcq: 1, short: 3, long: 10 }, negativeMarking: 0, instructions: 'Attempt all questions.',
    supplementSources: false, includeAnswerKey: true, includeExplanations: true, includeMarking: true,
    questionOrder: 'grouped',
  },
  questions: [{
    id: questionId, revision: 1, type: 'mcq',
    question: 'Which equation represents energy? <script>alert(1)</script>',
    options: ['E=mc²', 'E=m/c', 'E=c/m', 'E=m+c'], marks: 1, sourceReference: 'Chapter 2',
  }],
};
const answers: TestAnswer[] = [{
  questionId, revision: 1, correctOption: 0, modelAnswer: '',
  explanation: 'Mass and the speed of light determine rest energy.',
  markingScheme: [], sourceConfidence: 'supported',
}];

describe('A4 Test Studio document templates', () => {
  it('creates a student question paper without any answer data', () => {
    const html = questionPaperHtml(paper);
    expect(html).toContain('Energy &amp; &lt;Safety&gt;');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('E=mc²');
    expect(html).not.toContain('Answer Key');
    expect(html).not.toContain('Mass and the speed of light');
    expect(html).not.toContain('<script>');
  });

  it('creates a distinct answer key and teacher-only copy', () => {
    const key = answerKeyHtml(paper, answers);
    const teacher = teacherCopyHtml(paper, answers);
    expect(key).toContain('Answer Key & Marking Scheme');
    expect(key).toContain('Mass and the speed of light');
    expect(teacher).toContain('TEACHER COPY — CONTAINS ANSWERS');
    expect(teacher).toContain('Confidential teacher document');
  });

  it('dispatches only the requested document type', () => {
    expect(buildTestDocumentHtml('question_paper', paper)).not.toContain('Answer Key');
    expect(buildTestDocumentHtml('answer_key', paper, answers)).toContain('Answer Key');
    expect(buildTestDocumentHtml('teacher_copy', paper, answers)).toContain('TEACHER COPY');
    expect(() => buildTestDocumentHtml('answer_key', paper)).toThrow(/required/);
  });
});
