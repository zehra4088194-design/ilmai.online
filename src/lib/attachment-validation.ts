/** Shared, dependency-free attachment limits and byte checks. Never trusts a filename as a type. */
export type Attachment = { asset_id: string; name: string; mime: string; kind: string };
export const MAX_ATTACHMENTS = 8;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 100_000;
export const MAX_TOTAL_TEXT_CHARS = 200_000;
export const OFFICE_LIMITS = { entries: 512, fileBytes: 8 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 };
export const ATTACHMENT_PROMPT = 'Please analyze the attached files.';
export const ATTACHMENT_TYPES: Record<string, { kind: string; ext: string }> = {
  'image/png': { kind: 'image', ext: 'png' },
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'image/gif': { kind: 'image', ext: 'gif' },
  'application/pdf': { kind: 'pdf', ext: 'pdf' },
  'text/plain': { kind: 'file', ext: 'txt' },
  'text/markdown': { kind: 'file', ext: 'md' },
  'text/csv': { kind: 'file', ext: 'csv' },
  'application/json': { kind: 'file', ext: 'json' },
  'application/xml': { kind: 'file', ext: 'xml' },
  'text/xml': { kind: 'file', ext: 'xml' },
  'text/html': { kind: 'file', ext: 'html' },
  'text/css': { kind: 'file', ext: 'css' },
  'text/javascript': { kind: 'file', ext: 'js' },
  'application/javascript': { kind: 'file', ext: 'js' },
  'application/typescript': { kind: 'file', ext: 'ts' },
  'text/x-python': { kind: 'file', ext: 'py' },
  'text/x-sql': { kind: 'file', ext: 'sql' },
  'text/x-java-source': { kind: 'file', ext: 'java' },
  'text/x-c': { kind: 'file', ext: 'c' },
  'text/x-c++src': { kind: 'file', ext: 'cpp' },
  'text/yaml': { kind: 'file', ext: 'yaml' },
  'application/yaml': { kind: 'file', ext: 'yaml' },
  'application/rtf': { kind: 'file', ext: 'rtf' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'docx', ext: 'docx' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'pptx', ext: 'pptx' },
};

export function attachmentType(mime: string) {
  return Object.hasOwn(ATTACHMENT_TYPES, mime) ? ATTACHMENT_TYPES[mime] : undefined;
}

export function uploadLimits(maxMb: number) {
  const configured = Number.isFinite(maxMb) && maxMb > 0 ? Math.floor(maxMb * 1024 * 1024) : MAX_ATTACHMENT_BYTES;
  const maxBytes = Math.min(configured, MAX_ATTACHMENT_BYTES);
  return {
    maxFiles: MAX_ATTACHMENTS, maxBytes, maxTextBytes: Math.min(maxBytes, MAX_TEXT_BYTES),
    types: Object.entries(ATTACHMENT_TYPES).map(([mime, type]) => ({ mime, ...type })),
  };
}
export type UploadLimits = ReturnType<typeof uploadLimits>;

export function sanitizeFilename(name: string, fallback = 'attachment') {
  return name.normalize('NFKC').replace(/[\\/<>:"|?*\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 160) || fallback;
}

export function validateDeclaration(mime: string, size: number, maxBytes = MAX_ATTACHMENT_BYTES) {
  const type = attachmentType(mime);
  if (!type) throw new Error('Only PNG, JPEG, WebP, PDF, TXT, DOCX and PPTX files are supported');
  const limit = Math.min(maxBytes, MAX_ATTACHMENT_BYTES, type.kind === 'file' ? MAX_TEXT_BYTES : Infinity);
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('The file must not be empty');
  if (size > limit) throw new Error(`File exceeds the ${Math.round(limit / 1024)} KB limit`);
  return type;
}

export function decodeText(bytes: Uint8Array) {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Text must be valid UTF-8'); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('Binary data is not a text file');
  return text;
}

const matches = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((n, i) => bytes[offset + i] === n);
const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

/** Signature checks, not a full image/PDF decoder or malware scanner. ZIP structure is checked separately. */
export function validateAttachmentBytes(bytes: Uint8Array, mime: string, declaredSize: number, maxBytes = MAX_ATTACHMENT_BYTES) {
  const type = validateDeclaration(mime, declaredSize, maxBytes);
  if (bytes.length !== declaredSize) throw new Error('Uploaded file size does not match its declaration');
  let valid = false;
  if (mime === 'image/png') {
    valid = bytes.length >= 45 && matches(bytes, [137, 80, 78, 71, 13, 10, 26, 10]) &&
      ascii(bytes, 12, 16) === 'IHDR' && matches(bytes, [0, 0, 0, 13], 8) &&
      ascii(bytes, bytes.length - 8, bytes.length - 4) === 'IEND';
  } else if (mime === 'image/jpeg') {
    valid = bytes.length >= 4 && matches(bytes, [255, 216, 255]) && matches(bytes, [255, 217], bytes.length - 2);
  } else if (mime === 'image/webp') {
    const length = bytes.length >= 12 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) : 0;
    valid = bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(bytes, 12, 16)) && length + 8 === bytes.length;
  } else if (mime === 'application/pdf') {
    valid = /^%PDF-\d\.\d/.test(ascii(bytes, 0, 8)) && /%%EOF\s*$/.test(ascii(bytes, Math.max(0, bytes.length - 1024), bytes.length));
  } else if (mime === 'text/plain') {
    valid = !!decodeText(bytes).trim();
  } else {
    valid = bytes.length >= 22 && matches(bytes, [80, 75, 3, 4]);
  }
  if (!valid) throw new Error('File contents do not match the declared type (or the file is incomplete)');
  return type;
}
