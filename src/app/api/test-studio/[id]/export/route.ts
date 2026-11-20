import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { signedDownloadUrl } from '@/lib/storage/b2';
import { saveMedia } from '@/lib/media';
import {
  TestId, DocumentType, TestConfigSchema, QuestionSchema, AnswerSchema,
  sanitizeStudentPaper, validateQuestions, validateAnswers, type TestAnswer,
} from '@/lib/test-studio';
import { buildTestDocumentHtml } from '@/lib/test-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: TestId });
const Body = z.object({ documentType: DocumentType });

async function ownedTest(id: string, userId: string) {
  const db = adminClient();
  const { data: paper, error } = await db.from('test_papers').select('*')
    .eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!paper) throw new HttpError(404, 'Test not found');
  const { data: qRows, error: qError } = await db.from('test_questions').select('*')
    .eq('test_id', id).eq('user_id', userId).order('position');
  if (qError) throw qError;
  const questions = (qRows ?? []).map((q) => QuestionSchema.parse({
    id: q.id, revision: q.revision, type: q.type, question: q.question,
    options: q.options, marks: q.marks, sourceReference: q.source_reference,
  }));
  validateQuestions(questions);
  const config = TestConfigSchema.parse(paper.config);
  const student = sanitizeStudentPaper({ id, version: paper.version, config, questions });
  return { db, paper, student, questions, config };
}

export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const { profile } = await requireUserApi();
  const { id } = Params.parse(await params);
  const { db, paper } = await ownedTest(id, profile.id);
  const { data, error } = await db.from('test_exports').select('*')
    .eq('test_id', id).eq('user_id', profile.id).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  const exports = await Promise.all((data ?? []).map(async (item) => {
    const current = item.status === 'ready' && item.test_version === paper.version;
    return {
      id: item.id, documentType: item.document_type, version: item.test_version,
      status: current ? 'ready' : (item.status === 'ready' ? 'outdated' : item.status),
      createdAt: item.created_at,
      downloadUrl: current ? await signedDownloadUrl(item.storage_key, 300) : null,
    };
  }));
  return json({ exports }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('teacher_tests', profile.plan, isAdmin);
  const { id } = Params.parse(await params);
  const { documentType } = Body.parse(await req.json());
  const { db, paper, student, questions, config } = await ownedTest(id, profile.id);

  let answers: TestAnswer[] | undefined;
  if (documentType !== 'question_paper') {
    const { data, error } = await db.from('test_answer_keys').select('*')
      .eq('test_id', id).eq('user_id', profile.id);
    if (error) throw error;
    answers = (data ?? []).map((row) => AnswerSchema.parse({
      questionId: row.question_id, revision: row.revision, correctOption: row.correct_option,
      modelAnswer: row.model_answer, explanation: row.explanation,
      markingScheme: row.marking_scheme, sourceConfidence: row.source_confidence,
    }));
    try {
      validateAnswers(questions, answers, config);
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : 'The answer key is incomplete or outdated', 'answer_key_outdated');
    }
  }

  const rendererUrl = process.env.PDF_RENDERER_URL?.replace(/\/+$/, '');
  const rendererSecret = process.env.PDF_RENDERER_SECRET;
  if (!rendererUrl || !rendererSecret)
    throw new HttpError(503, 'PDF renderer is not configured on this deployment', 'pdf_renderer_not_configured');

  const html = buildTestDocumentHtml(documentType, student, answers);
  let response: Response;
  try {
    response = await fetch(rendererUrl + '/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + rendererSecret },
      body: JSON.stringify({ html, pageSize: 'A4', language: config.language }),
      signal: AbortSignal.timeout(90000),
      cache: 'no-store',
    });
  } catch {
    throw new HttpError(503, 'PDF renderer could not be reached. Please retry later.', 'pdf_renderer_unavailable');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new HttpError(502, detail.slice(0, 240) || 'PDF rendering failed', 'pdf_render_failed');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 500 || bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-')
    throw new HttpError(502, 'PDF renderer returned an invalid or oversized document', 'invalid_pdf');

  const media = await saveMedia({
    userId: profile.id, kind: 'pdf', body: bytes, mime: 'application/pdf',
    prompt: documentType + ': ' + paper.title, model: 'ilmai-pdf-renderer',
    meta: { test_id: id, document_type: documentType, test_version: paper.version, language: config.language },
  });
  const { data: exportRow, error: exportError } = await db.from('test_exports').insert({
    test_id: id, user_id: profile.id, media_asset_id: media.id, document_type: documentType,
    storage_key: media.storage_key, file_size_bytes: bytes.length, mime_type: 'application/pdf',
    test_version: paper.version, language: config.language, status: 'ready',
  }).select('id').single();
  if (exportError) throw exportError;

  return json({
    exportId: exportRow.id, documentType, version: paper.version,
    fileSizeBytes: bytes.length, downloadUrl: await signedDownloadUrl(media.storage_key, 300),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});
