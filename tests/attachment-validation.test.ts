import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_TYPES, MAX_TEXT_BYTES, OFFICE_LIMITS, attachmentType,
  uploadLimits, validateAttachmentBytes, validateDeclaration,
} from '@/lib/attachment-validation';

describe('expanded attachment formats', () => {
  it('exposes images, PDF, Word, PowerPoint, Excel and common data/code types', () => {
    for (const mime of [
      'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/markdown', 'text/csv', 'application/json', 'text/javascript',
      'application/typescript', 'text/x-python', 'text/x-sql',
    ]) expect(ATTACHMENT_TYPES[mime]).toBeDefined();
  });

  it('caps plain text/source files while allowing Office documents to use the Office cap', () => {
    const textType = attachmentType('text/plain');
    expect(textType?.kind).toBe('file');
    expect(() => validateDeclaration('text/plain', MAX_TEXT_BYTES + 1)).toThrow(/exceeds/i);

    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    expect(attachmentType(xlsx)?.ext).toBe('xlsx');
    expect(validateDeclaration(xlsx, OFFICE_LIMITS.fileBytes, OFFICE_LIMITS.fileBytes).kind).toBe('file');
    expect(() => validateDeclaration(xlsx, OFFICE_LIMITS.fileBytes + 1, OFFICE_LIMITS.fileBytes)).toThrow(/exceeds/i);
  });

  it('includes distinct text and Office limits in the client upload contract', () => {
    const limits = uploadLimits(15);
    expect(limits.maxFiles).toBe(8);
    expect(limits.maxTextBytes).toBe(MAX_TEXT_BYTES);
    expect(limits.maxOfficeBytes).toBe(OFFICE_LIMITS.fileBytes);
    expect(limits.types.some((item) => item.ext === 'xlsx')).toBe(true);
  });

  it('checks a spreadsheet archive signature before accepting the uploaded bytes', () => {
    const bytes = new Uint8Array(32);
    bytes.set([80, 75, 3, 4], 0);
    expect(() => validateAttachmentBytes(
      bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes.length,
    )).not.toThrow();
    expect(() => validateAttachmentBytes(new Uint8Array(32), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 32))
      .toThrow(/signature/i);
  });
});
