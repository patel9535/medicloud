import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { patientProfileColumn, validatePatientProfileUpdate } from './validation.js';

export const patientRouter = Router();
patientRouter.use(requireAuth, requireRole('PATIENT'));

async function findOwnProfile(userId) {
  const result = await pool.query(
    `SELECT p.id, p.user_id AS "userId", u.name, u.email,
            p.date_of_birth AS "dateOfBirth", p.gender, p.phone, p.address,
            p.emergency_contact AS "emergencyContact"
     FROM patients p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

patientRouter.get('/me', async (request, response, next) => {
  try {
    const profile = await findOwnProfile(request.user.id);
    if (!profile) return response.status(404).json({ success: false, data: null, message: 'Patient profile not found.' });
    return response.json({ success: true, data: { profile }, message: 'Patient profile.' });
  } catch (error) { return next(error); }
});

patientRouter.put('/me', async (request, response, next) => {
  const { updates, error: validationError } = validatePatientProfileUpdate(request.body);
  if (validationError) return response.status(422).json({ success: false, data: null, message: validationError });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (Object.hasOwn(updates, 'name')) {
      await client.query('UPDATE users SET name = $1, updated_at = now() WHERE id = $2', [updates.name, request.user.id]);
    }

    const entries = Object.entries(updates).filter(([field]) => field !== 'name');
    const values = entries.map(([, value]) => value);
    const clauses = entries.map(([field], index) => `${patientProfileColumn(field)} = $${index + 1}`);
    clauses.push('updated_at = now()');
    values.push(request.user.id);
    const updated = await client.query(
      `UPDATE patients SET ${clauses.join(', ')} WHERE user_id = $${values.length} RETURNING id`,
      values,
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ success: false, data: null, message: 'Patient profile not found.' });
    }
    await client.query('COMMIT');
    const profileResult = await client.query(
      `SELECT p.id, p.user_id AS "userId", u.name, u.email,
              p.date_of_birth AS "dateOfBirth", p.gender, p.phone, p.address,
              p.emergency_contact AS "emergencyContact"
       FROM patients p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
      [request.user.id],
    );
    return response.json({ success: true, data: { profile: profileResult.rows[0] }, message: 'Profile updated.' });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

patientRouter.get('/me/dashboard', async (request, response, next) => {
  try {
    const profileResult = await pool.query('SELECT id FROM patients WHERE user_id = $1', [request.user.id]);
    if (!profileResult.rowCount) return response.status(404).json({ success: false, data: null, message: 'Patient profile not found.' });
    const patientId = profileResult.rows[0].id;
    const [appointments, decisions] = await Promise.all([
      pool.query(
        `SELECT a.id, to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
                to_char(a.appointment_time, 'HH24:MI') AS time, a.status,
                d.specialization, u.name AS "doctorName"
         FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN users u ON u.id = d.user_id
         WHERE a.patient_id = $1 AND a.appointment_date >= CURRENT_DATE AND a.status IN ('PENDING', 'CONFIRMED')
         ORDER BY a.appointment_date, a.appointment_time LIMIT 5`,
        [patientId],
      ),
      pool.query(
        `SELECT a.id, to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
                to_char(a.appointment_time, 'HH24:MI') AS time, a.status,
                a.updated_at AS "updatedAt", d.specialization, u.name AS "doctorName"
         FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN users u ON u.id = d.user_id
         WHERE a.patient_id = $1 AND a.status IN ('CONFIRMED', 'REJECTED', 'COMPLETED')
         ORDER BY a.updated_at DESC LIMIT 5`,
        [patientId],
      ),
    ]);
    return response.json({
      success: true,
      data: { upcomingAppointments: appointments.rows, recentAppointmentDecisions: decisions.rows },
      message: 'Patient dashboard.',
    });
  } catch (error) { return next(error); }
});
