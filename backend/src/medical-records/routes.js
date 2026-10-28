import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { UUID_PATTERN } from '../appointments/validation.js';
import { validatePrescriptionCreate, validateRecordCreate, validateRecordUpdate } from './validation.js';

export const medicalRecordRouter = Router();
export const prescriptionRouter = Router();

medicalRecordRouter.use(requireAuth);
prescriptionRouter.use(requireAuth);

const recordSelect = `SELECT r.id, r.patient_id AS "patientId", r.doctor_id AS "doctorId",
  r.appointment_id AS "appointmentId", r.diagnosis, r.symptoms, r.notes,
  r.follow_up_date AS "followUpDate", r.created_at AS "createdAt", r.updated_at AS "updatedAt",
  pu.name AS "patientName", du.name AS "doctorName", d.specialization
  FROM medical_records r
  JOIN patients p ON p.id = r.patient_id JOIN users pu ON pu.id = p.user_id
  JOIN doctors d ON d.id = r.doctor_id JOIN users du ON du.id = d.user_id`;

const recordColumns = Object.freeze({
  diagnosis: 'diagnosis', symptoms: 'symptoms', notes: 'notes', followUpDate: 'follow_up_date',
});

function assignedPatientCondition(doctorUserPlaceholder, patientPlaceholder) {
  return `EXISTS (
    SELECT 1 FROM appointments access_a JOIN doctors access_d ON access_d.id = access_a.doctor_id
    WHERE access_d.user_id = ${doctorUserPlaceholder} AND access_a.patient_id = ${patientPlaceholder}
      AND access_a.status IN ('PENDING', 'CONFIRMED', 'COMPLETED')
  )`;
}

function canReadMedicalData(role) {
  return role === 'PATIENT' || role === 'DOCTOR';
}

medicalRecordRouter.get('/', async (request, response, next) => {
  const { role, id: userId } = request.user;
  if (!canReadMedicalData(role)) return response.status(403).json({ success: false, data: null, message: 'You do not have permission to view medical records.' });
  try {
    let where;
    let values;
    let authorizedDoctorId = null;
    if (role === 'PATIENT') {
      where = 'p.user_id = $1'; values = [userId];
    } else {
      const doctor = await pool.query('SELECT id FROM doctors WHERE user_id = $1', [userId]);
      if (!doctor.rowCount) return response.status(403).json({ success: false, data: null, message: 'Doctor profile not found.' });
      authorizedDoctorId = doctor.rows[0].id;
      const patientId = typeof request.query.patientId === 'string' ? request.query.patientId : '';
      if (patientId && !UUID_PATTERN.test(patientId)) return response.status(422).json({ success: false, data: null, message: 'patientId must be a valid patient identifier.' });
      where = assignedPatientCondition('$1', 'r.patient_id');
      values = [userId];
      if (patientId) {
        const assigned = await pool.query(
          `SELECT 1 FROM patients p WHERE p.id = $1 AND ${assignedPatientCondition('$2', 'p.id')}`,
          [patientId, userId],
        );
        if (!assigned.rowCount) return response.status(404).json({ success: false, data: null, message: 'Patient history not found.' });
        where += ' AND r.patient_id = $2'; values.push(patientId);
      }
    }
    const result = await pool.query(`${recordSelect} WHERE ${where} ORDER BY r.created_at DESC LIMIT 100`, values);
    const records = role === 'DOCTOR'
      ? result.rows.map((record) => ({ ...record, canEdit: record.doctorId === authorizedDoctorId }))
      : result.rows;
    return response.json({ success: true, data: { records }, message: 'Medical records.' });
  } catch (error) { return next(error); }
});

medicalRecordRouter.post('/', requireRole('DOCTOR'), async (request, response, next) => {
  const { record, error: validationError } = validateRecordCreate(request.body);
  if (validationError) return response.status(422).json({ success: false, data: null, message: validationError });
  try {
    const appointment = await pool.query(
      `SELECT a.id, a.status FROM appointments a JOIN doctors d ON d.id = a.doctor_id
       WHERE a.id = $1 AND d.user_id = $2`,
      [record.appointmentId, request.user.id],
    );
    if (!appointment.rowCount) return response.status(404).json({ success: false, data: null, message: 'Completed appointment not found.' });
    if (appointment.rows[0].status !== 'COMPLETED') return response.status(409).json({ success: false, data: null, message: 'A medical record can only be created after the appointment is completed.' });

    const inserted = await pool.query(
      `INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, symptoms, notes, follow_up_date)
       SELECT a.patient_id, a.doctor_id, a.id, $2, $3, $4, $5
       FROM appointments a JOIN doctors d ON d.id = a.doctor_id
       WHERE a.id = $1 AND d.user_id = $6 AND a.status = 'COMPLETED'
       RETURNING id`,
      [record.appointmentId, record.diagnosis, record.symptoms ?? null, record.notes ?? null, record.followUpDate ?? null, request.user.id],
    );
    if (!inserted.rowCount) return response.status(409).json({ success: false, data: null, message: 'The appointment is no longer available for a record.' });
    const result = await pool.query(`${recordSelect} WHERE r.id = $1`, [inserted.rows[0].id]);
    return response.status(201).json({ success: true, data: { record: result.rows[0] }, message: 'Medical record created.' });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ success: false, data: null, message: 'A medical record already exists for this appointment.' });
    return next(error);
  }
});

medicalRecordRouter.get('/:id', async (request, response, next) => {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) return response.status(404).json({ success: false, data: null, message: 'Medical record not found.' });
  const { role, id: userId } = request.user;
  if (!canReadMedicalData(role)) return response.status(403).json({ success: false, data: null, message: 'You do not have permission to view medical records.' });
  try {
    let scope;
    let values;
    if (role === 'PATIENT') {
      scope = 'p.user_id = $2'; values = [id, userId];
    } else {
      scope = assignedPatientCondition('$2', 'r.patient_id'); values = [id, userId];
    }
    const result = await pool.query(`${recordSelect} WHERE r.id = $1 AND ${scope}`, values);
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Medical record not found.' });
    return response.json({ success: true, data: { record: result.rows[0] }, message: 'Medical record.' });
  } catch (error) { return next(error); }
});

medicalRecordRouter.put('/:id', requireRole('DOCTOR'), async (request, response, next) => {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) return response.status(404).json({ success: false, data: null, message: 'Medical record not found.' });
  const { updates, error: validationError } = validateRecordUpdate(request.body);
  if (validationError) return response.status(422).json({ success: false, data: null, message: validationError });
  try {
    const entries = Object.entries(updates);
    const clauses = entries.map(([field], index) => `${recordColumns[field]} = $${index + 1}`);
    clauses.push('updated_at = now()');
    const values = entries.map(([, value]) => value);
    values.push(id, request.user.id);
    const updated = await pool.query(
      `UPDATE medical_records r SET ${clauses.join(', ')}
       FROM doctors d WHERE d.user_id = $${values.length} AND r.doctor_id = d.id AND r.id = $${values.length - 1}
       RETURNING r.id`,
      values,
    );
    if (!updated.rowCount) return response.status(404).json({ success: false, data: null, message: 'Medical record not found.' });
    const result = await pool.query(`${recordSelect} WHERE r.id = $1`, [id]);
    return response.json({ success: true, data: { record: result.rows[0] }, message: 'Medical record updated.' });
  } catch (error) { return next(error); }
});

const prescriptionSelect = `SELECT pr.id, pr.medical_record_id AS "medicalRecordId", pr.medicine,
  pr.dosage, pr.frequency, pr.duration, pr.instructions, pr.created_at AS "createdAt",
  r.patient_id AS "patientId", p.name AS "patientName", d.name AS "doctorName"
  FROM prescriptions pr JOIN medical_records r ON r.id = pr.medical_record_id
  JOIN patients patient ON patient.id = r.patient_id JOIN users p ON p.id = patient.user_id
  JOIN doctors author ON author.id = r.doctor_id JOIN users d ON d.id = author.user_id`;

prescriptionRouter.get('/', async (request, response, next) => {
  const { role, id: userId } = request.user;
  if (!canReadMedicalData(role)) return response.status(403).json({ success: false, data: null, message: 'You do not have permission to view prescriptions.' });
  try {
    const where = role === 'PATIENT' ? 'patient.user_id = $1' : assignedPatientCondition('$1', 'r.patient_id');
    const result = await pool.query(`${prescriptionSelect} WHERE ${where} ORDER BY pr.created_at DESC LIMIT 100`, [userId]);
    return response.json({ success: true, data: { prescriptions: result.rows }, message: 'Prescriptions.' });
  } catch (error) { return next(error); }
});

prescriptionRouter.post('/', requireRole('DOCTOR'), async (request, response, next) => {
  const { prescription, error: validationError } = validatePrescriptionCreate(request.body);
  if (validationError) return response.status(422).json({ success: false, data: null, message: validationError });
  try {
    const result = await pool.query(
      `INSERT INTO prescriptions (medical_record_id, medicine, dosage, frequency, duration, instructions)
       SELECT r.id, $2, $3, $4, $5, $6 FROM medical_records r
       JOIN doctors d ON d.id = r.doctor_id
       WHERE r.id = $1 AND d.user_id = $7
       RETURNING id, medical_record_id AS "medicalRecordId", medicine, dosage, frequency, duration, instructions, created_at AS "createdAt"`,
      [prescription.medicalRecordId, prescription.medicine, prescription.dosage, prescription.frequency, prescription.duration, prescription.instructions ?? null, request.user.id],
    );
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Medical record not found.' });
    return response.status(201).json({ success: true, data: { prescription: result.rows[0] }, message: 'Prescription created.' });
  } catch (error) { return next(error); }
});

prescriptionRouter.get('/:id', async (request, response, next) => {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) return response.status(404).json({ success: false, data: null, message: 'Prescription not found.' });
  const { role, id: userId } = request.user;
  if (!canReadMedicalData(role)) return response.status(403).json({ success: false, data: null, message: 'You do not have permission to view prescriptions.' });
  try {
    const where = role === 'PATIENT' ? 'patient.user_id = $2' : assignedPatientCondition('$2', 'r.patient_id');
    const result = await pool.query(`${prescriptionSelect} WHERE pr.id = $1 AND ${where}`, [id, userId]);
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Prescription not found.' });
    return response.json({ success: true, data: { prescription: result.rows[0] }, message: 'Prescription.' });
  } catch (error) { return next(error); }
});
