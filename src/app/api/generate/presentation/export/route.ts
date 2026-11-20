import type { NextRequest } from 'next/server';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { adminClient } from '@/lib/supabase/admin';
import { saveMedia } from '@/lib/media';
import { signedDownloadUrl } from '@/lib/storage/b2';
import { PresentationExportInput } from '@/lib/presentation-schema';
import { buildPresentationPptx, buildPresentationPdfHtml } from '@/lib/presentation-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const feature = await requireFeature('presentations', profile.plan, isAdmin);
  const body = PresentationExportInput.parse(await req.json());

  let bytes: Buffer;
  let kind: 'pptx' | 'pdf';
  let mime: string;
  let model = 'ilmai-presentation-export';

  if (body.format === 'pptx') {
    bytes = await buildPresentationPptx(body.deck, body.theme);
    kind = 'pptx';
    mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  } else {
    if (feature.config?.pdf_export === false) throw new HttpError(403, 'PDF export is currently disabled', 'pdf_export_disabled');
    const rendererUrl = process.env.PDF_RENDERER_URL?.replace(/\/+$/, '');
    const rendererSecret = process.env.PDF_RENDERER_SECRET;
    if (!rendererUrl || !rendererSecret) throw new HttpError(503, 'PDF renderer is not configured on this deployment', 'pdf_renderer_not_configured');
    const response = await fetch(rendererUrl + '/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + rendererSecret },
      body: JSON.stringify({ html: buildPresentationPdfHtml(body.deck, body.language, body.theme), pageSize: 'wide', language: body.language }),
      signal: AbortSignal.timeout(90000),
      cache: 'no-store',
    }).catch(() => null);
    if (!response?.ok) throw new HttpError(502, 'Could not render the presentation PDF', 'pdf_render_failed');
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 500 || bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-')
      throw new HttpError(502, 'PDF renderer returned an invalid document', 'invalid_pdf');
    kind = 'pdf';
    mime = 'application/pdf';
    model = 'ilmai-presentation-pdf';
  }

  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new HttpError(413, 'Presentation export exceeds the file size limit');
  const media = await saveMedia({
    userId: profile.id, kind, body: bytes, mime,
    prompt: body.deck.title, model, meta: { format: body.format, theme: body.theme, slides: body.deck.slides.length },
  });
  const { error } = await adminClient().from('media_assets').update({
    meta: { format: body.format, theme: body.theme, slides: body.deck.slides.length, download_name: body.deck.title },
  }).eq('id', media.id).eq('user_id', profile.id);
  if (error) throw error;
  return json({
    asset: { id: media.id, kind, sizeBytes: bytes.length, url: await signedDownloadUrl(media.storage_key, 300) },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});
