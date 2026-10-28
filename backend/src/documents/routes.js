import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { isValidPatientId, validateDocumentUpload } from './validation.js';

export const documentRouter = Router();
documentRouter.use(requireAuth);

const backendRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const storageRoot = resolve(backendRoot, config.documentStorageDir || './private-documents');
const documentFields = `SELECT doc.id, doc.patient_id AS "patientId", doc.uploaded_by AS "uploadedBy",
  doc.file_name AS "fileName", doc.file_type AS "fileType", doc.file_size AS "fileSize",
  doc.created_at AS "createdAt", pu.name AS "patientName", uploader.name AS "uploadedByName"
  FROM documents doc JOIN patients p ON p.id = doc.patient_id
  JOIN users pu ON pu.id = p.user_id JOIN users uploader ON uploader.id = doc.uploaded_by`;

function doctorPatientScope(userIdPlaceholder, patientIdExpression) {
  return `EXISTS (SELECT 1 FROM appointments a JOIN doctors d ON d.id = a.doctor_id
    WHERE d.user_id = ${userIdPlaceholder} AND a.patient_id = ${patientIdExpression}
    AND a.status IN ('PENDING', 'CONFIRMED', 'COMPLETED'))`;
}

async function findAuthorizedDocument(documentId, user) {
  if (user.role === 'PATIENT') {
    return pool.query(`${documentFields} WHERE doc.id = $1 AND p.user_id = $2`, [documentId, user.id]);
  }
  if (user.role === 'DOCTOR') {
    return pool.query(`${documentFields} WHERE doc.id = $1 AND ${doctorPatientScope('$2', 'doc.patient_id')}`, [documentId, user.id]);
  }
  return { rowCount: 0, rows: [] };
}

documentRouter.get('/', async (request, response, next) => {
  const { role, id: userId } = request.user;
  if (role !== 'PATIENT' && role !== 'DOCTOR') return response.status(403).json({ success: false, data: null, message: 'You do not have permission to view documents.' });
  try {
    let where;
    let values;
    if (role === 'PATIENT') {
      where = 'p.user_id = $1'; values = [userId];
    } else {
      const patientId = request.query.patientId;
      if (!isValidPatientId(patientId)) return response.status(422).json({ success: false, data: null, message: 'Doctors must provide a valid patientId.' });
      where = `${doctorPatientScope('$2', 'doc.patient_id')} AND doc.patient_id = $1`;
      values = [patientId, userId];
    }
    const result = await pool.query(`${documentFields} WHERE ${where} ORDER BY doc.created_at DESC LIMIT 100`, values);
    return response.json({ success: true, data: { documents: result.rows }, message: 'Documents.' });
  } catch (error) { return next(error); }
});

documentRouter.post('/', requireRole('PATIENT'), async (request, response, next) => {
  let fileName;
  try { fileName = decodeURIComponent(request.get('x-file-name') ?? ''); }
  catch { return response.status(422).json({ success: false, data: null, message: 'Provide a valid file name.' }); }
  const validation = validateDocumentUpload({
    contentType: request.get('content-type')?.split(';')[0].trim().toLowerCase(),
    fileName,
    buffer: request.body,
  });
  if (validation.error) return response.status(422).json({ success: false, data: null, message: validation.error });
  let objectStorageKey;
  try {
    const patient = await pool.query('SELECT id FROM patients WHERE user_id = $1', [request.user.id]);
    if (!patient.rowCount) return response.status(403).json({ success: false, data: null, message: 'Patient profile not found.' });
    objectStorageKey = randomUUID();
    await mkdir(storageRoot, { recursive: true, mode: 0o700 });
    await writeFile(resolve(storageRoot, objectStorageKey), request.body, { flag: 'wx', mode: 0o600 });
    const inserted = await pool.query(
      `INSERT INTO documents (patient_id, uploaded_by, file_name, object_storage_key, file_type, file_size)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [patient.rows[0].id, request.user.id, validation.file.fileName, objectStorageKey, validation.file.contentType, validation.file.fileSize],
    );
    const result = await pool.query(`${documentFields} WHERE doc.id = $1`, [inserted.rows[0].id]);
    return response.status(201).json({ success: true, data: { document: result.rows[0] }, message: 'Document uploaded.' });
  } catch (error) {
    if (objectStorageKey) await unlink(resolve(storageRoot, objectStorageKey)).catch(() => {});
    return next(error);
  }
});

documentRouter.get('/:id', async (request, response, next) => {
  if (!isValidPatientId(request.params.id)) return response.status(404).json({ success: false, data: null, message: 'Document not found.' });
  try {
    const result = await findAuthorizedDocument(request.params.id, request.user);
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Document not found.' });
    return response.json({ success: true, data: { document: result.rows[0] }, message: 'Document.' });
  } catch (error) { return next(error); }
});

documentRouter.get('/:id/download', async (request, response, next) => {
  if (!isValidPatientId(request.params.id)) return response.status(404).json({ success: false, data: null, message: 'Document not found.' });
  try {
    const result = await findAuthorizedDocument(request.params.id, request.user);
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Document not found.' });
    const stored = await pool.query('SELECT object_storage_key, file_type FROM documents WHERE id = $1', [request.params.id]);
    if (!stored.rowCount) return response.status(404).json({ success: false, data: null, message: 'Document not found.' });
    const filePath = resolve(storageRoot, stored.rows[0].object_storage_key);
    if (dirname(filePath) !== storageRoot) return response.status(404).json({ success: false, data: null, message: 'Document not found.' });
    const file = await readFile(filePath);
    const safeName = result.rows[0].fileName.replace(/[\r\n"\\]/g, '_');
    response.set({
      'Content-Type': stored.rows[0].file_type,
      'Content-Length': String(file.length),
      'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(result.rows[0].fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return response.send(file);
  } catch (error) {
    if (error.code === 'ENOENT') return response.status(404).json({ success: false, data: null, message: 'Document file not found.' });
    return next(error);
  }
});
