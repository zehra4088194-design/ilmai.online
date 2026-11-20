import { z } from 'zod';
import { extractJson } from '@/lib/json-extract';

export type QuizQuestion = { type: 'mcq' | 'tf'; question: string; options: string[]; answer: number; explanation: string };
export type QuizConfig = { count: number; difficulty: 'easy' | 'medium' | 'hard'; kind: 'mcq' | 'tf' | 'mixed'; language: string };

const Raw = z.object({
  type: z.string().optional(),
  question: z.string().min(3),
  options: z.array(z.union([z.string(), z.number()]).transform(String)).min(2).max(6),
  answer: z.union([z.number(), z.string()]),
  explanation: z.string().optional().default(''),
});

const shuffle = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Validates + normalises whatever the model returned. Invalid questions are dropped. */
export function parseQuiz(text: string, max: number): QuizQuestion[] {
  const json = extractJson(text);
  const list: unknown[] = Array.isArray(json) ? json : Array.isArray((json as { questions?: unknown[] })?.questions) ? (json as { questions: unknown[] }).questions : [];
  const out: QuizQuestion[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const p = Raw.safeParse(item);
    if (!p.success) continue;
    const options = p.data.options.map((o) => o.trim()).filter(Boolean);
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) continue; // duplicate options
    let answer = typeof p.data.answer === 'number' ? p.data.answer : /^[A-Fa-f]$/.test(p.data.answer.trim()) ? p.data.answer.trim().toUpperCase().charCodeAt(0) - 65 : parseInt(p.data.answer, 10);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;
    const question = p.data.question.trim();
    if (seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());

    const isTf = p.data.type === 'tf' || options.length === 2;
    let opts = options;
    if (!isTf) { // models love putting the right answer first – shuffle and re-point
      const correct = options[answer];
      opts = shuffle(options);
      answer = opts.indexOf(correct);
    }
    out.push({ type: isTf ? 'tf' : 'mcq', question, options: opts, answer, explanation: p.data.explanation.trim() });
    if (out.length >= max) break;
  }
  return out;
}

export function quizPrompt(o: { topic: string; config: QuizConfig; audience: string; grade?: string | null; context?: string }) {
  const kindText = o.config.kind === 'mcq' ? 'multiple choice (4 options)' : o.config.kind === 'tf' ? 'true/false' : 'a mix of multiple choice (4 options) and true/false';
  return [
    {
      role: 'system' as const,
      content: 'You are an expert teacher who writes accurate, fair, exam-style quiz questions. Reply with ONLY valid JSON. No markdown, no commentary.',
    },
    {
      role: 'user' as const,
      content: `Create a quiz.
Topic: ${o.topic}
Learner: ${o.audience}${o.grade ? `, ${o.grade}` : ''}
Difficulty: ${o.config.difficulty}
Number of questions: ${o.config.count}
Question type: ${kindText}
Language: ${o.config.language}
${o.context ? `Base the questions ONLY on this material:\n"""\n${o.context}\n"""\n` : ''}
JSON format:
{"questions":[{"type":"mcq","question":"...","options":["...","...","...","..."],"answer":0,"explanation":"one or two sentences"}]}

Rules:
- Exactly one correct option; "answer" is the 0-based index of the correct option.
- Options must be plausible, distinct and not numbered or lettered.
- True/false questions use "type":"tf" and options ["True","False"] (translate the words for Urdu).
- Explanations must be factually correct and concise.
- Do not repeat questions. Return exactly ${o.config.count} questions.`,
    },
  ];
}
