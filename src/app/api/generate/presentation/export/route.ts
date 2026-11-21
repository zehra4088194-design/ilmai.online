import type { NextRequest } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { saveMedia } from '@/lib/media';
import { PresentationExportInput } from '@/lib/presentation-schema';
import { buildPresentationPptx, buildPresentationPdfHtml } from '@/lib/presentation-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function safeFileName(title: string, extension: 'pptx' | 'pdf') {
  const base = title.replace(/[\\/:*?"<>|]+/g, '-').replace(/[\\s.]+$/g, '').slice(0, 100) || 'ilmai-presentation';
  return `${base}.${extension}`;
}

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('presentations', profile.plan, isAdmin);
  const body = PresentationExportInput.parse(await req.json());

  let bytes: Buffer;
  let mime: string;
  let model = 'ilmai-presentation-export';
  if (body.format === 'pptx') {
    bytes = await buildPresentationPptx(body.deck, body.theme);
    mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  } else {
    if (feature.config?.pdf_export === false)
      throw new HttpError(403, 'PDF export is currently disabled by the administrator', 'pdf_export_disabled');
    const rendererUrl = process.env.PDF_RENDERER_URL?.replace(/\\/+$/, '');
    const rendererSecret = process.env.PDF_RENDERER_SECRET;
    if (!rendererUrl || !rendererSecret)
      throw new HttpError(503, 'PDF renderer is not configured on this deployment yet. Editable PPTX download is available meanwhile.', 'pdf_renderer_not_configured');
    const response = await fetch(rendererUrl + '/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + rendererSecret },
      body: JSON.stringify({ html: buildPresentationPdfHtml(body.deck, body.language, body.theme), pageSize: 'wide', language: body.language }),
      signal: AbortSignal.timeout(90000),
      cache: 'no-store',
    }).catch(() => null);
    if (!response?.ok) throw new HttpError(502, 'PDF renderer failed. Please try again or download the editable PPTX.', 'pdf_render_failed');
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 500 || bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-')
      throw new HttpError(502, 'PDF renderer returned an invalid document', 'invalid_pdf');
    mime = 'application/pdf';
    model = 'ilmai-presentation-pdf';
  }

  if (!bytes.length || bytes.length > 30 * 1024 * 1024)
    throw new HttpError(413, 'Presentation export exceeds the file size limit');

  // Archive to the user's Library when storage is configured, but never block the direct download.
  try {
    await saveMedia({
      userId: profile.id, kind: body.format, body: bytes, mime,
      prompt: body.deck.title, model,
      meta: { format: body.format, theme: body.theme, slides: body.deck.slides.length, download_name: body.deck.title },
    });
  } catch (error) {
    console.warn('[presentation-export] Library archive failed; direct download will continue:', error instanceof Error ? error.message : 'unknown error');
  }

  const filename = safeFileName(body.deck.title, body.format);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
