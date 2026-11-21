import katex from 'katex';
import type { StudentPaper, TestAnswer, TestDocumentType, TestQuestion } from '@/lib/test-studio';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!));

function safeText(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_all, expression: string) =>
    '<div class="math-display" dir="ltr">' + katex.renderToString(expression.trim(), {
      displayMode: true, throwOnError: false, strict: 'ignore', trust: false,
    }) + '</div>');
  html = html.replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (_all, expression: string) =>
    '<span class="math-inline" dir="ltr">' + katex.renderToString(expression.trim(), {
      displayMode: false, throwOnError: false, strict: 'ignore', trust: false,
    }) + '</span>');
  return html.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function documentStyles(language: string) {
  const rtl = language === 'Urdu';
  return [
    '@page { size: A4 portrait; margin: 18mm 16mm 20mm; }',
    '* { box-sizing: border-box; }',
    'html { font-family: "Noto Nastaliq Urdu", "Noto Naskh Arabic", "Noto Sans", sans-serif; color: #17251e; font-size: 10.5pt; }',
    'body { margin: 0; direction: ' + (rtl ? 'rtl' : 'ltr') + '; text-align: ' + (rtl ? 'right' : 'left') + '; line-height: 1.65; }',
    '.latin, .math-inline, .math-display, .meta-ltr { direction: ltr; unicode-bidi: isolate; font-family: "Noto Sans", "DejaVu Sans", sans-serif; }',
    '.sheet { width: 100%; }',
    '.brand { display:flex; justify-content:space-between; align-items:center; padding-bottom:5mm; border-bottom:2px solid #198754; color:#198754; font-size:9pt; font-weight:700; }',
    '.teacher-ribbon { margin: 0 0 5mm; padding: 3mm; border: 2px solid #9a3412; color:#9a3412; font-weight:900; text-align:center; letter-spacing:.5px; }',
    'h1 { margin:5mm 0 1mm; font-size:22pt; line-height:1.35; }',
    'h2 { margin:7mm 0 3mm; padding-bottom:2mm; border-bottom:1px solid #c7d8cf; color:#176b46; font-size:14pt; break-after:avoid; }',
    'h3 { margin:5mm 0 2mm; font-size:12pt; break-after:avoid; }',
    'p { margin:1.5mm 0; }',
    '.subheading { color:#52655b; margin-bottom:4mm; }',
    '.meta { display:grid; grid-template-columns:1fr 1fr; gap:2mm 8mm; padding:4mm; background:#f2f7f4; border:1px solid #d6e5dc; border-radius:3mm; margin:4mm 0; }',
    '.student-fields { display:grid; grid-template-columns:2fr 1fr; gap:4mm; margin:4mm 0; }',
    '.field { border-bottom:1px solid #83988d; min-height:9mm; padding-bottom:1mm; }',
    '.instructions { border:1px solid #d6e5dc; border-radius:2mm; padding:3mm 4mm; margin:4mm 0 6mm; }',
    '.question { margin:4mm 0; break-inside:avoid; page-break-inside:avoid; }',
    '.q-heading { display:flex; align-items:flex-start; gap:2mm; font-weight:700; }',
    '.q-number { min-width:8mm; color:#176b46; }',
    '.marks { margin-inline-start:auto; color:#53665c; font-size:9pt; white-space:nowrap; }',
    '.options { display:grid; grid-template-columns:1fr 1fr; gap:2mm 6mm; margin:2mm 0 1mm; padding-inline-start:8mm; }',
    '.option { break-inside:avoid; }',
    '.answer-space { border-bottom:1px solid #cbd5cf; margin-top:2mm; height:var(--answer-space,18mm); }',
    '.answer { margin:2mm 0 4mm; padding:3mm 4mm; background:#f6faf7; border-inline-start:3px solid #198754; break-inside:avoid; }',
    '.answer-points { margin:2mm 0 0; padding-inline-start:6mm; }',
    '.point { margin:1mm 0; }',
    '.uncertain { padding:2mm 3mm; margin:2mm 0; color:#92400e; background:#fff7ed; border:1px solid #fed7aa; font-size:9pt; }',
    '.math-display { overflow-wrap:anywhere; text-align:center; margin:3mm 0; }',
    '.katex { font-size:1em; }',
    '.section-break { break-before:page; page-break-before:always; }',
    '.footer-note { margin-top:7mm; padding-top:2mm; border-top:1px solid #d5e0d9; color:#738279; font-size:8pt; text-align:center; }',
    '.keep { break-inside:avoid; page-break-inside:avoid; }',
    '@media print { a { color:inherit; } }',
  ].join('\n');
}

function heading(paper: StudentPaper, teacher: boolean) {
  const config = paper.config;
  const meta = [
    '<div><strong>Time:</strong> ' + config.duration + ' minutes</div>',
    '<div><strong>Total marks:</strong> ' + paper.totalMarks + '</div>',
    '<div><strong>MCQs:</strong> ' + paper.counts.mcq + '</div>',
    '<div><strong>Short questions:</strong> ' + paper.counts.short + '</div>',
    '<div><strong>Long questions:</strong> ' + paper.counts.long + '</div>',
    '<div><strong>Date:</strong> __________________</div>',
  ].join('');
  const subtitle = [config.subject, config.topic, config.grade ? 'Class ' + config.grade : ''].filter(Boolean).join(' · ');
  return (teacher ? '<div class="teacher-ribbon">TEACHER COPY — CONTAINS ANSWERS</div>' : '') +
    '<div class="brand"><span>ILM AI · EXAMINATION</span><span class="meta-ltr">Version ' + paper.version + '</span></div>' +
    '<h1 dir="auto">' + safeText(config.title || 'Examination Paper') + '</h1>' +
    '<div class="subheading" dir="auto">' + safeText(subtitle) + '</div>' +
    '<div class="meta">' + meta + '</div>' +
    '<div class="student-fields"><div class="field">Student name: ______________________________</div><div class="field">Roll number: ______________</div></div>' +
    (config.instructions ? '<div class="instructions"><strong>Instructions</strong><p dir="auto">' + safeText(config.instructions) + '</p></div>' : '');
}

function sectionQuestions(paper: StudentPaper, type: 'mcq'|'short'|'long') {
  const questions = paper.questions.filter((q) => q.type === type);
  if (!questions.length) return '';
  const title = type === 'mcq' ? 'Section A · Multiple Choice Questions' : type === 'short' ? 'Section B · Short Questions' : 'Section C · Long Questions';
  return '<section><h2>' + title + '</h2>' + questions.map((q, i) => questionHtml(q, i)).join('') + '</section>';
}

function questionHtml(q: TestQuestion, index: number) {
  const options = q.type === 'mcq'
    ? '<div class="options">' + q.options.map((option, i) =>
      '<div class="option"><strong>' + OPTION_LABELS[i] + '.</strong> <span dir="auto">' + safeText(option) + '</span></div>').join('') + '</div>'
    : '<div class="answer-space" style="--answer-space:' + Math.min(55, q.marks * (q.type === 'long' ? 9 : 5)) + 'mm"></div>';
  return '<div class="question"><div class="q-heading"><span class="q-number">' + (index + 1) + '.</span><span dir="auto">' +
    safeText(q.question) + '</span><span class="marks">[' + q.marks + ']</span></div>' + options + '</div>';
}

export function questionPaperHtml(paper: StudentPaper): string {
  const body = heading(paper, false) +
    sectionQuestions(paper, 'mcq') + sectionQuestions(paper, 'short') + sectionQuestions(paper, 'long') +
    '<div class="footer-note">Prepared with Ilm AI · Check your answers before submission</div>';
  return fullDocument(body, paper.config.language);
}

function answerHtml(paper: StudentPaper, answers: TestAnswer[]) {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const sections = (['mcq','short','long'] as const).map((type) => {
    const questions = paper.questions.filter((q) => q.type === type);
    if (!questions.length) return '';
    const label = type === 'mcq' ? 'MCQ Answer Key' : type === 'short' ? 'Short Question Answers' : 'Long Question Answers';
    return '<section><h2>' + label + '</h2>' + questions.map((q, index) => {
      const answer = byId.get(q.id);
      if (!answer) return '';
      const correct = answer.correctOption === null ? null : q.options[answer.correctOption];
      const answerText = type === 'mcq'
        ? '<strong>' + OPTION_LABELS[answer.correctOption ?? 0] + ' · ' + safeText(correct ?? '') + '</strong>'
        : '<div dir="auto">' + safeText(answer.modelAnswer) + '</div>';
      const points = answer.markingScheme.length
        ? '<ul class="answer-points">' + answer.markingScheme.map((point) =>
          '<li class="point"><span dir="auto">' + safeText(point.point) + '</span> <strong>(' + point.marks + ')</strong></li>').join('') + '</ul>'
        : '';
      const explanation = answer.explanation ? '<p><strong>Explanation:</strong> <span dir="auto">' + safeText(answer.explanation) + '</span></p>' : '';
      const confidence = answer.sourceConfidence === 'uncertain'
        ? '<div class="uncertain">This answer could not be confidently verified against the supplied source. Please review before use.</div>' : '';
      return '<div class="question"><div class="q-heading"><span class="q-number">' + (index + 1) + '.</span><span dir="auto">' +
        safeText(q.question) + '</span><span class="marks">[' + q.marks + ']</span></div><div class="answer">' +
        answerText + points + explanation + confidence + '</div></div>';
    }).join('') + '</section>';
  }).join('');
  return '<div class="section-break"></div><div class="brand"><span>ILM AI · ANSWER KEY</span><span class="meta-ltr">Version ' +
    paper.version + '</span></div><h1>Answer Key & Marking Scheme</h1><p class="subheading" dir="auto">' +
    safeText(paper.config.title || 'Examination Paper') + '</p>' + sections;
}

export function answerKeyHtml(paper: StudentPaper, answers: TestAnswer[]): string {
  return fullDocument(heading(paper, false) + answerHtml(paper, answers), paper.config.language);
}

export function teacherCopyHtml(paper: StudentPaper, answers: TestAnswer[]): string {
  const body = heading(paper, true) +
    sectionQuestions(paper, 'mcq') + sectionQuestions(paper, 'short') + sectionQuestions(paper, 'long') +
    answerHtml(paper, answers) +
    '<div class="footer-note">Confidential teacher document · Contains answers and marking schemes</div>';
  return fullDocument(body, paper.config.language);
}

function fullDocument(body: string, language: string) {
  const rtl = language === 'Urdu';
  return '<!doctype html><html lang="' + (rtl ? 'ur' : 'en') + '" dir="' + (rtl ? 'rtl' : 'ltr') +
    '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    documentStyles(language) + '</style></head><body><main class="sheet">' + body + '</main></body></html>';
}

export function buildTestDocumentHtml(type: TestDocumentType, paper: StudentPaper, answers?: TestAnswer[]) {
  if (type === 'question_paper') return questionPaperHtml(paper);
  if (!answers) throw new Error('Answer data is required for this document');
  if (type === 'answer_key') return answerKeyHtml(paper, answers);
  return teacherCopyHtml(paper, answers);
}
