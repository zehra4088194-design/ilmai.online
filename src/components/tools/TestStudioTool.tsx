'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import { useApp } from '@/components/chat/AppShell';
import { useToast } from '@/components/providers';
import { api } from '@/lib/client-api';
import type { Attachment } from '@/lib/attachment-validation';
import type {
  AnswerValue, QuestionKind, StudentPaper, StudioPolicy, TestAnswer, TestConfig, TestQuestion,
} from '@/lib/test-studio';

type SavedPaper = StudentPaper & {
  title: string;
  status: string;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
};
type HistoryRow = {
  id: string; title: string; status: string; version: number; counts: Record<QuestionKind, number>;
  total_marks: number; created_at: string; updated_at: string;
};
type ExportRow = { id: string; documentType: string; version: number; status: string; createdAt: string; downloadUrl: string | null };
type KeyStatus = { complete: boolean; stale: string[] };

const INITIAL_CONFIG: TestConfig = {
  topic: '', prompt: '', sourceIds: [], title: '', subject: '', grade: '',
  language: 'English', difficulty: 'medium',
  mcq: 10, short: 5, long: 2, duration: 60,
  marks: { mcq: 1, short: 3, long: 10 },
  negativeMarking: 0, instructions: '',
  supplementSources: false, includeAnswerKey: true, includeExplanations: true,
  includeMarking: true, questionOrder: 'grouped',
};

function emptyAnswer(question: TestQuestion): TestAnswer {
  return {
    questionId: question.id, revision: question.revision,
    correctOption: null, modelAnswer: '', explanation: '',
    markingScheme: question.type === 'mcq' ? [] : [{ point: 'Add the key marking point', marks: question.marks }],
    sourceConfidence: 'supported',
  };
}

function updateSummary(questions: TestQuestion[]) {
  const counts = { mcq: 0, short: 0, long: 0 };
  let totalMarks = 0;
  for (const question of questions) {
    counts[question.type]++;
    totalMarks += question.marks;
  }
  return { counts, totalMarks };
}

function formatDate(value: string) {
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

export function TestStudioTool() {
  const { refreshMe } = useApp();
  const toast = useToast();
  const [config, setConfig] = useState<TestConfig>(INITIAL_CONFIG);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [policy, setPolicy] = useState<StudioPolicy | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [paper, setPaper] = useState<SavedPaper | null>(null);
  const [answers, setAnswers] = useState<Record<string, TestAnswer>>({});
  const [dirtyAnswers, setDirtyAnswers] = useState<Set<string>>(new Set());
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ complete: false, stale: [] });
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

  const sourceIds = useMemo(() => attachments.map((file) => file.asset_id), [attachments]);

  const refreshHistory = useCallback(async () => {
    const data = await api<{ papers: HistoryRow[]; policy: StudioPolicy }>('/api/test-studio', 'GET');
    setHistory(data.papers ?? []);
    setPolicy(data.policy);
  }, []);

  useEffect(() => {
    refreshHistory().catch((e) => setError(e instanceof Error ? e.message : 'Could not load Test Studio'))
      .finally(() => setLoading(false));
  }, [refreshHistory]);

  const loadAnswers = useCallback(async (id: string, currentPaper: SavedPaper) => {
    const data = await api<{ answers: TestAnswer[]; complete: boolean; stale: string[] }>('/api/test-studio/' + id + '/answers', 'GET');
    const map: Record<string, TestAnswer> = {};
    for (const answer of data.answers) map[answer.questionId] = answer;
    for (const question of currentPaper.questions) if (!map[question.id]) map[question.id] = emptyAnswer(question);
    setAnswers(map);
    setKeyStatus({ complete: data.complete, stale: data.stale });
    setDirtyAnswers(new Set());
  }, []);

  const loadExports = useCallback(async (id: string) => {
    const data = await api<{ exports: ExportRow[] }>('/api/test-studio/' + id + '/export', 'GET');
    setExports(data.exports ?? []);
  }, []);

  const openPaper = useCallback(async (id: string) => {
    setBusy(true); setError(''); setWarnings([]); setKeyOpen(false); setAnswers({});
    try {
      const data = await api<{ paper: SavedPaper }>('/api/test-studio/' + id, 'GET');
      setPaper(data.paper);
      setConfig(data.paper.config);
      setAttachments([]);
      await loadExports(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this test');
    } finally { setBusy(false); }
  }, [loadExports]);

  async function generate() {
    if (busy || uploading) return;
    if (!config.topic.trim() && !config.prompt.trim() && sourceIds.length === 0) {
      setError('Add a topic, instructions or at least one source file.'); return;
    }
    setBusy(true); setAction('Generating questions and answer key'); setError(''); setPaper(null);
    try {
      const data = await api<{ paper: StudentPaper; warnings: string[] }>('/api/generate/test', 'POST', {
        ...config, sourceIds, requestId: crypto.randomUUID(),
      });
      const saved: SavedPaper = {
        ...data.paper, title: data.paper.config.title, status: 'ready',
        warnings: data.warnings ?? [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      setPaper(saved);
      setConfig(saved.config);
      setWarnings(data.warnings ?? []);
      setAnswers({});
      setKeyOpen(false);
      setDirtyAnswers(new Set());
      setExports([]);
      await refreshHistory();
      await refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test generation failed');
    } finally { setBusy(false); setAction(''); }
  }

  function changeQuestion(id: string, patch: Partial<TestQuestion>) {
    setPaper((current) => {
      if (!current) return current;
      const questions = current.questions.map((question) => question.id === id ? { ...question, ...patch } : question);
      return { ...current, questions, ...updateSummary(questions) };
    });
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setPaper((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.questions.length) return current;
      const questions = [...current.questions];
      const item = questions[index];
      questions[index] = questions[target];
      questions[target] = item;
      return { ...current, questions };
    });
  }

  function addQuestion() {
    if (!paper || paper.questions.length >= 100) return;
    const question: TestQuestion = {
      id: crypto.randomUUID(), revision: 1, type: 'short',
      question: '', options: [], marks: paper.config.marks.short, sourceReference: '',
    };
    const questions = [...paper.questions, question];
    setPaper({ ...paper, questions, ...updateSummary(questions) });
  }

  function removeQuestion(id: string) {
    if (!paper || paper.questions.length <= 1) return;
    const questions = paper.questions.filter((question) => question.id !== id);
    setPaper({ ...paper, questions, ...updateSummary(questions) });
    setDirtyAnswers((current) => new Set([...current].filter((item) => item !== id)));
  }

  function updateAnswer(id: string, patch: Partial<AnswerValue>) {
    if (!paper) return;
    const question = paper.questions.find((item) => item.id === id);
    if (!question) return;
    setAnswers((current) => {
      const before = current[id] ?? emptyAnswer(question);
      return { ...current, [id]: { ...before, ...patch, questionId: id, revision: question.revision } };
    });
    setDirtyAnswers((current) => new Set(current).add(id));
  }

  async function toggleKey() {
    if (!paper) return;
    if (keyOpen) { setKeyOpen(false); return; }
    setKeyOpen(true);
    if (Object.keys(answers).length) return;
    setAction('Loading protected answer key');
    try { await loadAnswers(paper.id, paper); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load answer key'); }
    finally { setAction(''); }
  }

  async function regenerate(scope: 'question' | 'category' | 'full', questionId?: string, category?: QuestionKind) {
    if (!paper || busy) return;
    setBusy(true); setAction('Regenerating questions'); setError('');
    try {
      const data = await api<{ paper: StudentPaper; warnings: string[] }>('/api/test-studio/' + paper.id + '/regenerate', 'POST', {
        requestId: crypto.randomUUID(), expectedVersion: paper.version, scope, questionId, category,
      });
      const latest = await api<{ paper: SavedPaper }>('/api/test-studio/' + paper.id, 'GET');
      setPaper(latest.paper);
      setConfig(latest.paper.config);
      setWarnings(data.warnings ?? []);
      if (keyOpen) await loadAnswers(paper.id, latest.paper);
      await loadExports(paper.id);
      await refreshHistory();
      await refreshMe();
      toast('Selected questions regenerated', 'ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate this test');
    } finally { setBusy(false); setAction(''); }
  }

  async function savePaper() {
    if (!paper || busy) return;
    setBusy(true); setAction('Saving changes'); setError('');
    try {
      const replacements = [...dirtyAnswers].map((id) => {
        const answer = answers[id];
        if (!answer) return null;
        return {
          questionId: answer.questionId, correctOption: answer.correctOption,
          modelAnswer: answer.modelAnswer, explanation: answer.explanation,
          markingScheme: answer.markingScheme, sourceConfidence: answer.sourceConfidence,
        };
      }).filter(Boolean);
      await api('/api/test-studio/' + paper.id, 'PATCH', {
        expectedVersion: paper.version,
        config: paper.config,
        questions: paper.questions,
        replacements,
      });
      const latest = await api<{ paper: SavedPaper }>('/api/test-studio/' + paper.id, 'GET');
      setPaper(latest.paper);
      setConfig(latest.paper.config);
      setDirtyAnswers(new Set());
      if (keyOpen) await loadAnswers(paper.id, latest.paper);
      await loadExports(paper.id);
      await refreshHistory();
      toast('Test saved', 'ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save test');
    } finally { setBusy(false); setAction(''); }
  }

  async function exportDocument(documentType: 'question_paper' | 'answer_key' | 'teacher_copy') {
    if (!paper || busy) return;
    if (policy?.pdf_export === false) { setError('PDF export is disabled until the private PDF renderer is deployed and enabled by the administrator.'); return; }
    setBusy(true); setAction('Preparing ' + documentType.replaceAll('_', ' ')); setError('');
    try {
      const data = await api<{ downloadUrl: string }>('/api/test-studio/' + paper.id + '/export', 'POST', { documentType });
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      await loadExports(paper.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF export failed');
    } finally { setBusy(false); setAction(''); }
  }

  async function deletePaper(id: string) {
    if (!window.confirm('Delete this test and its saved answer key?')) return;
    setBusy(true); setError('');
    try {
      await api('/api/test-studio/' + id, 'DELETE');
      if (paper?.id === id) { setPaper(null); setAnswers({}); setKeyOpen(false); setExports([]); }
      await refreshHistory();
      toast('Test deleted', 'ok');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete test'); }
    finally { setBusy(false); }
  }

  function changePaperConfig(patch: Partial<TestConfig>) {
    setPaper((current) => current ? { ...current, config: { ...current.config, ...patch } } : current);
    setConfig((current) => ({ ...current, ...patch }));
  }

  if (loading) return <div className="card p-8 text-center text-sm text-muted-foreground">Loading Test Studio…</div>;

  return (
    <div className="space-y-6">
      {!paper && (
        <>
          <section className="glass space-y-4 rounded-3xl p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-xl font-extrabold">Create an examination paper</h2><p className="mt-1 text-sm text-muted-foreground">Build MCQ, short and long questions from your topic or supplied textbook material.</p></div>
              {policy && <span className="badge">{policy.generation_cost} credits per generation</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Paper title<input className="input" value={config.title} maxLength={200} onChange={(e) => setConfig({ ...config, title: e.target.value })} placeholder="e.g. Mid-term examination" /></label>
              <label className="space-y-1 text-sm font-medium">Subject<input className="input" value={config.subject} maxLength={120} onChange={(e) => setConfig({ ...config, subject: e.target.value })} placeholder="e.g. Biology" /></label>
              <label className="space-y-1 text-sm font-medium">Class / grade<input className="input" value={config.grade} maxLength={80} onChange={(e) => setConfig({ ...config, grade: e.target.value })} placeholder="e.g. 9" /></label>
              <label className="space-y-1 text-sm font-medium">Topic<input className="input" value={config.topic} maxLength={2000} onChange={(e) => setConfig({ ...config, topic: e.target.value })} placeholder="e.g. Cell structure and function" /></label>
            </div>
            <label className="block space-y-1 text-sm font-medium">Specific instructions / syllabus coverage<textarea className="input min-h-24" value={config.prompt} maxLength={12000} onChange={(e) => setConfig({ ...config, prompt: e.target.value })} placeholder="Mention chapters, learning objectives or the exact topics to assess…" /></label>
            <div>
              <p className="mb-2 text-sm font-semibold">Textbook sources</p>
              <AttachmentPicker value={attachments} onChange={setAttachments} disabled={busy} onUploadingChange={setUploading} />
              <p className="mt-1 text-xs text-muted-foreground">Attach PDF pages, photos, text, DOCX or PPTX. Scanned PDFs need a model that supports document input.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm font-medium">Language<select className="input" value={config.language} onChange={(e) => setConfig({ ...config, language: e.target.value as TestConfig['language'] })}><option>English</option><option>Urdu</option><option>Roman Urdu</option></select></label>
              <label className="space-y-1 text-sm font-medium">Difficulty<select className="input" value={config.difficulty} onChange={(e) => setConfig({ ...config, difficulty: e.target.value as TestConfig['difficulty'] })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="mixed">Mixed</option></select></label>
              <label className="space-y-1 text-sm font-medium">Duration (minutes)<input className="input" type="number" min={1} max={600} value={config.duration} onChange={(e) => setConfig({ ...config, duration: Number(e.target.value) })} /></label>
              <label className="space-y-1 text-sm font-medium">Negative marking<input className="input" type="number" min={0} max={100} step={0.25} value={config.negativeMarking} onChange={(e) => setConfig({ ...config, negativeMarking: Number(e.target.value) })} /></label>
              <label className="space-y-1 text-sm font-medium">Question order<select className="input" value={config.questionOrder} onChange={(e) => setConfig({ ...config, questionOrder: e.target.value as TestConfig['questionOrder'] })}><option value="grouped">Group by type</option><option value="mixed">Mix question types</option></select></label>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="mb-3 text-sm font-bold">Question counts and marks</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(['mcq', 'short', 'long'] as const).map((kind) => (
                  <div key={kind} className="space-y-2">
                    <p className="text-sm font-semibold capitalize">{kind === 'mcq' ? 'MCQ' : kind + ' questions'}</p>
                    <label className="block text-xs text-muted-foreground">Count<input className="input mt-1" type="number" min={0} max={100} value={config[kind]} onChange={(e) => setConfig({ ...config, [kind]: Number(e.target.value) })} /></label>
                    <label className="block text-xs text-muted-foreground">Marks each<input className="input mt-1" type="number" min={1} max={100} value={config.marks[kind]} onChange={(e) => setConfig({ ...config, marks: { ...config.marks, [kind]: Number(e.target.value) } })} /></label>
                  </div>
                ))}
              </div>
            </div>
            <label className="block space-y-1 text-sm font-medium">Instructions to print on the paper<textarea className="input min-h-20" value={config.instructions} maxLength={4000} onChange={(e) => setConfig({ ...config, instructions: e.target.value })} placeholder="e.g. Attempt all questions. Show your working." /></label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={config.supplementSources} onChange={(e) => setConfig({ ...config, supplementSources: e.target.checked })} />Allow general knowledge to supplement sources</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={config.includeAnswerKey} onChange={(e) => setConfig({ ...config, includeAnswerKey: e.target.checked })} />Prepare a separate answer key</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={config.includeExplanations} onChange={(e) => setConfig({ ...config, includeExplanations: e.target.checked })} />Include explanations</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={config.includeMarking} onChange={(e) => setConfig({ ...config, includeMarking: e.target.checked })} />Include written-question marking scheme</label>
            </div>
            {policy && <p className="text-xs text-muted-foreground">Limit: {policy.max_questions} questions · {policy.max_sources} sources · {policy.daily_limit} tests per day. An uncertain source-derived answer is labelled for teacher review.</p>}
            <button className="btn-primary w-full !py-3 sm:w-auto" disabled={busy || uploading || (!config.topic.trim() && !config.prompt.trim() && !attachments.length)} onClick={generate}>
              {busy ? action || 'Working…' : 'Generate test'}
            </button>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Your saved tests</h2><button className="btn-ghost text-xs" onClick={() => refreshHistory().catch((e) => setError(e.message))}>Refresh</button></div>
            {!history.length ? <div className="card p-6 text-center text-sm text-muted-foreground">Your generated papers will appear here.</div> : (
              <div className="grid gap-2">
                {history.map((item) => (
                  <div key={item.id} className="card flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{formatDate(item.updated_at)} · Version {item.version} · {item.total_marks} marks</p></div>
                    <button className="btn-outline text-xs" disabled={busy} onClick={() => openPaper(item.id)}>Open</button>
                    <button className="btn-ghost text-xs text-danger" disabled={busy} onClick={() => deletePaper(item.id)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {paper && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><button className="btn-ghost mb-2 text-xs" onClick={() => { setPaper(null); setKeyOpen(false); setAnswers({}); }}>← All tests</button>
              <h2 className="text-xl font-extrabold">{paper.title || 'Examination paper'}</h2>
              <p className="text-xs text-muted-foreground">Version {paper.version} · {paper.totalMarks} marks · Last updated {formatDate(paper.updatedAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline text-xs" disabled={busy} onClick={savePaper}>Save changes</button>
              <button className="btn-ghost text-xs" disabled={busy} onClick={toggleKey}>{keyOpen ? 'Hide answer key' : 'Show answer key'}</button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-3"><p className="text-xs text-muted-foreground">MCQ</p><p className="text-xl font-bold">{paper.counts.mcq}</p></div>
            <div className="card p-3"><p className="text-xs text-muted-foreground">Short</p><p className="text-xl font-bold">{paper.counts.short}</p></div>
            <div className="card p-3"><p className="text-xs text-muted-foreground">Long</p><p className="text-xl font-bold">{paper.counts.long}</p></div>
          </div>

          <div className="glass space-y-3 rounded-3xl p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Paper title<input className="input" value={paper.config.title} maxLength={200} onChange={(e) => changePaperConfig({ title: e.target.value })} /></label>
              <label className="space-y-1 text-sm font-medium">Instructions<input className="input" value={paper.config.instructions} maxLength={4000} onChange={(e) => changePaperConfig({ instructions: e.target.value })} /></label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Questions</h3><div className="flex flex-wrap gap-2"><button className="btn-ghost text-xs" disabled={busy || !paper.counts.mcq} onClick={() => regenerate('category', undefined, 'mcq')}>Regenerate MCQs</button><button className="btn-ghost text-xs" disabled={busy || !paper.counts.short} onClick={() => regenerate('category', undefined, 'short')}>Regenerate short</button><button className="btn-ghost text-xs" disabled={busy || !paper.counts.long} onClick={() => regenerate('category', undefined, 'long')}>Regenerate long</button><button className="btn-outline text-xs" disabled={busy} onClick={() => regenerate('full')}>Regenerate all</button><button className="btn-outline text-xs" disabled={paper.questions.length >= 100 || busy} onClick={addQuestion}>Add short question</button></div></div>
            {paper.questions.map((question, index) => (
              <article key={question.id} className="rounded-2xl border border-border bg-background p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="badge">{index + 1} · {question.type.toUpperCase()}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Revision {question.revision}</span>
                  <button className="btn-ghost text-xs" disabled={index === 0} onClick={() => moveQuestion(index, -1)}>↑</button>
                  <button className="btn-ghost text-xs" disabled={index === paper.questions.length - 1} onClick={() => moveQuestion(index, 1)}>↓</button>
                  <button className="btn-ghost text-xs" disabled={busy} onClick={() => regenerate('question', question.id)}>Regenerate</button>
                  <button className="btn-ghost text-xs text-danger" disabled={paper.questions.length <= 1 || busy} onClick={() => removeQuestion(question.id)}>Remove</button>
                </div>
                <textarea className="input min-h-20" dir="auto" value={question.question} onChange={(e) => changeQuestion(question.id, { question: e.target.value })} />
                {question.type === 'mcq' && <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className="text-xs text-muted-foreground">{'Option ' + 'ABCD'[optionIndex]}
                      <input className="input mt-1" dir="auto" value={option} onChange={(e) => changeQuestion(question.id, { options: question.options.map((v, i) => i === optionIndex ? e.target.value : v) })} />
                    </label>
                  ))}
                </div>}
                <div className="mt-2 flex items-center gap-2"><label className="text-xs text-muted-foreground">Marks<input className="input mt-1 w-24" type="number" min={1} max={100} value={question.marks} onChange={(e) => changeQuestion(question.id, { marks: Number(e.target.value) })} /></label>
                  {question.sourceReference && <p className="min-w-0 truncate text-xs text-muted-foreground">Source: {question.sourceReference}</p>}
                </div>
              </article>
            ))}
            <p className="text-right text-sm font-bold">Total marks: {paper.totalMarks}</p>
          </div>

          {keyOpen && (
            <div className="glass space-y-3 rounded-3xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">Protected answer key</h3><p className="text-xs text-muted-foreground">Loaded separately from the question paper. Answer changes are saved with question revisions.</p></div>
                <span className={keyStatus.complete ? 'badge' : 'badge bg-amber-100 text-amber-900'}>{keyStatus.complete ? 'Complete' : 'Needs review'}</span>
              </div>
              {paper.questions.map((question, index) => {
                const answer = answers[question.id] ?? emptyAnswer(question);
                return <div key={question.id} className="rounded-2xl border border-border bg-background p-3 space-y-2">
                  <p className="text-sm font-semibold">{index + 1}. {question.question}</p>
                  {question.type === 'mcq' ? (
                    <label className="block text-xs font-medium">Correct option<select className="input mt-1" value={answer.correctOption === null ? '' : String(answer.correctOption)} onChange={(e) => updateAnswer(question.id, { correctOption: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">Choose correct option</option>{question.options.map((option, i) => <option key={i} value={i}>{'ABCD'[i] + '. ' + option}</option>)}
                    </select></label>
                  ) : (
                    <label className="block text-xs font-medium">Model answer<textarea className="input mt-1 min-h-24" dir="auto" value={answer.modelAnswer} onChange={(e) => updateAnswer(question.id, { modelAnswer: e.target.value })} /></label>
                  )}
                  {paper.config.includeExplanations && <label className="block text-xs font-medium">Explanation<textarea className="input mt-1 min-h-16" dir="auto" value={answer.explanation} onChange={(e) => updateAnswer(question.id, { explanation: e.target.value })} /></label>}
                  {question.type !== 'mcq' && paper.config.includeMarking && <label className="block text-xs font-medium">Marking point<textarea className="input mt-1 min-h-16" dir="auto" value={answer.markingScheme.map((point) => point.point).join('\n')} onChange={(e) => updateAnswer(question.id, { markingScheme: e.target.value.trim() ? [{ point: e.target.value, marks: question.marks }] : [] })} /></label>}
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={answer.sourceConfidence === 'uncertain'} onChange={(e) => updateAnswer(question.id, { sourceConfidence: e.target.checked ? 'uncertain' : 'supported' })} />Mark this answer as uncertain / needs teacher verification</label>
                </div>;
              })}
              <p className="text-xs text-muted-foreground">Changed questions invalidate their previous answers. Review and update the key before exporting the Answer Key or Teacher Copy.</p>
            </div>
          )}

          <div className="glass rounded-3xl p-4 space-y-3">
            <h3 className="font-bold">Export documents</h3>
            <p className="text-xs text-muted-foreground">Each option creates a separate A4 PDF. The question paper never contains answers. Answer-key and teacher-copy exports require a complete, current answer key.</p>
            {policy?.pdf_export === false && <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">PDF export is temporarily disabled. Deploy the private Playwright renderer in Coolify, configure PDF_RENDERER_URL and PDF_RENDERER_SECRET, then enable PDF export in the Test Studio feature settings.</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline text-xs" disabled={busy || policy?.pdf_export === false} onClick={() => exportDocument('question_paper')}>Question Paper PDF</button>
              <button className="btn-outline text-xs" disabled={busy || policy?.pdf_export === false} onClick={() => exportDocument('answer_key')}>Answer Key PDF</button>
              <button className="btn-primary text-xs" disabled={busy || policy?.pdf_export === false} onClick={() => exportDocument('teacher_copy')}>Teacher Copy PDF</button>
            </div>
            {exports.length > 0 && <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-semibold">Previous exports</p>
              {exports.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-0 flex-1">{item.documentType.replaceAll('_', ' ')} · v{item.version} · {formatDate(item.createdAt)}</span>
                <span className="badge">{item.status}</span>
                {item.downloadUrl && <a className="text-primary underline" href={item.downloadUrl} target="_blank" rel="noopener noreferrer">Download</a>}
              </div>)}
            </div>}
          </div>
          <div className="flex flex-wrap justify-between gap-2"><button className="btn-ghost text-danger" disabled={busy} onClick={() => deletePaper(paper.id)}>Delete test</button><button className="btn-primary" disabled={busy} onClick={savePaper}>{busy ? action || 'Working…' : 'Save edits'}</button></div>
        </section>
      )}

      {warnings.map((warning, index) => <p key={index} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {busy && action && <p role="status" className="text-center text-xs text-muted-foreground">{action}…</p>}
    </div>
  );
}
