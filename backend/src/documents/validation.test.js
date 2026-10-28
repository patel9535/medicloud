import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DOCUMENT_BYTES, sanitizeFileName, validateDocumentUpload } from './validation.js';

test('document validation accepts signed PDF and sanitizes its name', () => {
  const result = validateDocumentUpload({ contentType: 'application/pdf', fileName: '..\\visit\nsummary.pdf', buffer: Buffer.from('%PDF-1.7 synthetic') });
  assert.equal(result.error, null);
  assert.equal(result.file.fileName, '.._visit_summary.pdf');
  assert.equal(result.file.fileSize, Buffer.byteLength('%PDF-1.7 synthetic'));
});

test('document validation rejects unsupported, mismatched, empty, and oversized files', () => {
  assert.match(validateDocumentUpload({ contentType: 'text/html', fileName: 'file.html', buffer: Buffer.from('<html>') }).error, /Only PDF/);
  assert.match(validateDocumentUpload({ contentType: 'application/pdf', fileName: 'fake.pdf', buffer: Buffer.from('<html>') }).error, /contents do not match/);
  assert.match(validateDocumentUpload({ contentType: 'image/png', fileName: 'empty.png', buffer: Buffer.alloc(0) }).error, /empty/);
  assert.match(validateDocumentUpload({ contentType: 'application/pdf', fileName: 'large.pdf', buffer: Buffer.alloc(MAX_DOCUMENT_BYTES + 1) }).error, /10 MB/);
});

test('file names reject empty values and strip path separators and control characters', () => {
  assert.equal(sanitizeFileName(''), null);
  assert.equal(sanitizeFileName('C:\\private\\report.pdf'), 'C:_private_report.pdf');
  assert.equal(sanitizeFileName('report\u0000.pdf'), 'report_.pdf');
});
