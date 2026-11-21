import 'server-only';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { readObject, signedDownloadUrl } from '@/lib/storage/b2';
import { HttpError } from '@/lib/http';
import {
  type Attachment, ATTACHMENT_PROMPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_EXTRACTED_CHARS,
  MAX_TOTAL_TEXT_CHARS, OFFICE_LIMITS, attachmentType, decodeText, sanitizeFilename, validateAttachmentBytes,
} from '@/lib/attachment-validation';
export type { Attachment } from '@/lib/attachment-validation';

export const AttachmentIds = z.array(z.string().uuid().transform((id) => id.toLowerCase())).max(MAX_ATTACHMENTS)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate attachments are not allowed');

export type AttachmentAsset = {
  id: string; user_id: string; status: string; storage_key: string; mime: string; kind: string; size_bytes: number;
  meta: { name?: string; attachment_verified?: boolean } | null;
};

export function canonicalAttachment(a: AttachmentAsset): Attachment {
  const type = attachmentType(a.mime);
  if (!type || a.status !== 'ready' || !a.meta?.attachment_verified ||
      !a.storage_key.startsWith(`attachments/${a.user_id}/`)) throw new HttpError(404, 'Attachment not found');
  return { asset_id: a.id, name: sanitizeFilename(a.meta.name ?? `attachment.${type.ext}`), mime: a.mime, kind: type.kind };
}

async function loadAttachments(ids: string[], userId: string): Promise<AttachmentAsset[]> {
  const parsed = AttachmentIds.parse(ids);
  if (!parsed.length) return [];
  const { data, error } = await adminClient().from('media_assets')
    .select('id,user_id,status,storage_key,mime,kind,size_bytes,meta')
    .in('id', parsed).eq('user_id', userId).eq('status', 'ready');
  if (error) throw error;
  const rows = new Map((data as AttachmentAsset[] ?? []).map((a) => [a.id, a]));
  return parsed.map((id) => {
    const a = rows.get(id);
    if (!a || a.user_id !== userId) throw new HttpError(404, 'Attachment not found');
    canonicalAttachment(a);
    return a;
  });
}

/** IDs are the only client authority. All persisted metadata is derived from owned, verified assets. */
export async function validateAttachments(ids: string[], userId: string): Promise<Attachment[]> {
  return (await loadAttachments(ids, userId)).map(canonicalAttachment);
}

function xmlText(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML entities are not supported');
  return xml.replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_all, entity: string) => {
    if (entity.startsWith('#')) {
      const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new Error('Invalid XML character');
      return String.fromCodePoint(n);
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()];
  }).replace(/\s+/g, ' ').trim();
}

function extractOffice(bytes: Uint8Array, kind: string) {
  let entries = 0, total = 0;
  const names = new Set<string>();
  const sizes = new Map<string, number>();
  const wanted = (name: string) => name === '[Content_Types].xml' || (kind === 'docx'
    ? name === 'word/document.xml'
    : kind === 'pptx'
      ? name === 'ppt/presentation.xml' || /^ppt\/slides\/slide\d+\.xml$/.test(name)
      : name === 'xl/workbook.xml' || name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  // The filter runs BEFORE inflation/allocation, including on entries we will not extract.
  const files = unzipSync(bytes, { filter: (file) => {
    entries++;
    total += file.originalSize;
    if (entries > OFFICE_LIMITS.entries || !Number.isSafeInteger(file.originalSize) || file.originalSize < 0 ||
        file.originalSize > OFFICE_LIMITS.fileBytes || total > OFFICE_LIMITS.totalBytes)
      throw new Error('Office archive exceeds extraction limits');
    if (names.has(file.name) || file.name.length > 240 || /[\\\u0000]/.test(file.name) ||
        file.name.startsWith('/') || file.name.split('/').includes('..') || /vbaProject\.bin$/i.test(file.name))
      throw new Error('Unsafe Office archive entry');
    if (file.compression !== 0 && file.compression !== 8) throw new Error('Unsupported Office archive compression');
    names.add(file.name);
    sizes.set(file.name, file.originalSize);
    return wanted(file.name);
  } });
  const main = kind === 'docx' ? 'word/document.xml' : kind === 'pptx' ? 'ppt/presentation.xml' : 'xl/workbook.xml';
  if (!files['[Content_Types].xml'] || !files[main]) throw new Error('File is not the declared Office document type');
  const contentTypes = decodeText(files['[Content_Types].xml']);
  const expectedType = kind === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
    : kind === 'pptx'
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  if (!contentTypes.includes(expectedType) || /macroEnabled/i.test(contentTypes)) throw new Error('File is not the declared Office document type');

  if (kind === 'xlsx') {
    const sharedXml = files['xl/sharedStrings.xml'] ? decodeText(files['xl/sharedStrings.xml']) : '';
    const shared = (sharedXml.match(/<si\\b[\\s\\S]*?<\\/si>/g) ?? []).map(xmlText);
    const rows: string[] = [];
    for (const name of Object.keys(files).filter((entry) => /^xl\\/worksheets\\/sheet\\d+\\.xml$/.test(entry)).sort()) {
      const xml = decodeText(files[name]);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML entities are not supported');
      for (const row of xml.match(/<row\\b[\\s\\S]*?<\\/row>/g) ?? []) {
        const cells: string[] = [];
        for (const match of row.matchAll(/<c\\b([^>]*)>([\\s\\S]*?)<\\/c>/g)) {
          const attrs = match[1];
          const body = match[2];
          const ref = attrs.match(/\\br="([A-Z]+)\\d+"/i)?.[1] ?? '';
          let col = 0;
          for (const ch of ref) col = col * 26 + ch.charCodeAt(0) - 64;
          const type = attrs.match(/\\bt="([^"]+)"/)?.[1] ?? '';
          const value = body.match(/<v>([\\s\\S]*?)<\\/v>/)?.[1] ?? '';
          const cell = type === 's' ? (shared[Number(value)] ?? '') :
            type === 'inlineStr' ? xmlText(body) : value;
          if (col > 0 && col <= 256) cells[col - 1] = cell;
        }
        rows.push(cells.map((cell) => cell ?? '').join('\\t'));
      }
    }
    if (!rows.some((row) => row.trim())) throw new Error('No readable spreadsheet cells found');
    return boundedText(rows.join('\\n').trim());
  }

  let text = '';
  for (const name of Object.keys(files).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    if (files[name].length !== sizes.get(name)) throw new Error('Incomplete Office archive entry');
    const xml = decodeText(files[name]);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML entities are not supported');
    if (name === '[Content_Types].xml' || name === main) continue;
    // Only document text runs, not relationships, arbitrary embedded files or user-controlled URLs.
    const runs = xml.match(/<(?:w|a):t(?:\s[^>]*)?>[\s\S]*?<\/(?:w|a):t>/g) ?? [];
    for (const run of runs) {
      if (text.length > MAX_EXTRACTED_CHARS) break;
      text += xmlText(run) + ' ';
    }
  }
  if (!text.trim()) throw new Error('No readable text found in this Office document');
  return boundedText(text.trim());
}

function boundedText(text: string) {
  return text.length <= MAX_EXTRACTED_CHARS ? text : `${text.slice(0, MAX_EXTRACTED_CHARS)}\n[Attachment text truncated]`;
}

/** Validation used both before publication and when extracting verified bytes for a provider. */
export function verifyAttachment(bytes: Uint8Array, mime: string, size: number, maxBytes = MAX_ATTACHMENT_BYTES): string | undefined {
  try {
    const type = validateAttachmentBytes(bytes, mime, size, maxBytes);
    if (mime === 'text/plain') return boundedText(decodeText(bytes));
    if (type.kind === 'docx' || type.kind === 'pptx' || type.kind === 'xlsx') return extractOffice(bytes, type.kind);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Invalid attachment', 'invalid_attachment');
  }
}

/** Provider-ready parts. Callers must gate file_upload; no arbitrary remote URLs are ever fetched. */
export async function attachmentContent(text: string, ids: string[], userId: string, capabilities: { vision: boolean; documents: boolean }): Promise<string | unknown[]> {
  const assets = await loadAttachments(ids, userId);
  if (!assets.length) return text;
  // Fail before signing/reading any bytes if even one attachment cannot be consumed.
  for (const a of assets) {
    if (canonicalAttachment(a).kind === 'image' && !capabilities.vision) throw new HttpError(400, 'This model does not support image attachments');
    if (a.mime === 'application/pdf' && !capabilities.documents) throw new HttpError(400, 'This model does not support PDF attachments');
  }
  const parts: unknown[] = [{ type: 'text', text: text.trim() || ATTACHMENT_PROMPT }];
  let chars = 0;
  for (const a of assets) {
    const attachment = canonicalAttachment(a);
    if (attachment.kind === 'image') {
      parts.push({ type: 'image_url', image_url: { url: await signedDownloadUrl(a.storage_key, 300) } });
    } else if (a.mime === 'application/pdf') {
      parts.push({ type: 'file', file: { filename: attachment.name, file_data: await signedDownloadUrl(a.storage_key, 300) } });
    } else {
      const bytes = await readObject(a.storage_key, a.size_bytes, a.mime, MAX_ATTACHMENT_BYTES);
      const extracted = verifyAttachment(bytes, a.mime, a.size_bytes) ?? '';
      chars += extracted.length;
      if (chars > MAX_TOTAL_TEXT_CHARS) throw new HttpError(413, 'Combined attachment text is too large; send fewer files');
      parts.push({ type: 'text', text: `Attached document: ${attachment.name}\n<attachment_text>\n${extracted}\n</attachment_text>` });
    }
  }
  return parts;
}
