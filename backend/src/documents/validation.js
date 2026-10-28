import { UUID_PATTERN } from '../appointments/validation.js';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const MIME_SIGNATURES = Object.freeze({
  'application/pdf': (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  'image/png': (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
});

export function sanitizeFileName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').replace(/[\\/\0-\x1f\x7f]/g, '_').trim().slice(0, 180);
  if (!name || name === '.' || name === '..') return null;
  return name;
}

export function validateDocumentUpload({ contentType, fileName, buffer }) {
  const name = sanitizeFileName(fileName);
  if (!name) return { error: 'Provide a valid file name.' };
  if (!Object.hasOwn(MIME_SIGNATURES, contentType)) return { error: 'Only PDF, PNG, and JPEG files are supported.' };
  if (!Buffer.isBuffer(buffer) || !buffer.length) return { error: 'The uploaded file is empty.' };
  if (buffer.length > MAX_DOCUMENT_BYTES) return { error: 'Files must be 10 MB or smaller.' };
  if (!MIME_SIGNATURES[contentType](buffer)) return { error: 'The file contents do not match the selected file type.' };
  return { file: { fileName: name, contentType, fileSize: buffer.length }, error: null };
}

export function isValidPatientId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
