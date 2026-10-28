import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { slotsForDate } from '../doctors/availability.js';
import { UUID_PATTERN, validateBookingRequest, validateDoctorStatus } from './validation.js';

export const appointmentRouter = Router();

const appointmentSelect = `SELECT a.id, a.patient_id AS "patientId", a.doctor_id AS "doctorId",
  to_char(a.appointment_date, 'YYYY-MM-DD') AS date, to_char(a.appointment_time, 'HH24:MI') AS time, a.status, a.reason,
  a.created_at AS "createdAt", a.updated_at AS "updatedAt",
  pu.name AS "patientName", du.name AS "doctorName", d.specialization
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id JOIN users pu ON pu.id = p.user_id
  JOIN doctors d ON d.id = a.doctor_id JOIN users du ON du.id = d.user_id`;

appointmentRouter.get('/', requireAuth, async (request, response, next) => {
  try {
    let query;
    let values = [];
    if (request.user.role === 'PATIENT') {
      query = `${appointmentSelect} WHERE p.user_id = $1 ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 100`;
      values = [request.user.id];
    } else if (request.user.role === 'DOCTOR') {
      query = `${appointmentSelect} WHERE d.user_id = $1 ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 100`;
      values = [request.user.id];
    } else if (request.user.role === 'ADMIN') {
      query = `${appointmentSelect} ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 100`;
    } else {
      return response.status(403).json({ success: false, data: null, message: 'You do not have permission to view appointments.' });
    }
    const result = await pool.query(query, values);
    return response.json({ success: true, data: { appointments: result.rows }, message: 'Appointments.' });
  } catch (error) { return next(error); }
});

appointmentRouter.post('/', requireAuth, requireRole('PATIENT'), async (request, response, next) => {
  const { booking, error: validationError } = validateBookingRequest(request.body);
  if (validationError) return response.status(422).json({ success: false, data: null, message: validationError });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctorResult = await client.query('SELECT id, availability FROM doctors WHERE id = $1 FOR SHARE', [booking.doctorId]);
    if (!doctorResult.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ success: false, data: null, message: 'Doctor not found.' });
    }
    const clockResult = await client.query("SELECT CURRENT_DATE::text AS today, to_char(LOCALTIME, 'HH24:MI') AS \"currentTime\"");
    const { today, currentTime } = clockResult.rows[0];
    if (booking.date < today || (booking.date === today && booking.time <= currentTime)) {
      await client.query('ROLLBACK');
      return response.status(422).json({ success: false, data: null, message: 'Choose a future appointment date and time.' });
    }
    if (!slotsForDate(doctorResult.rows[0].availability, booking.date).includes(booking.time)) {
      await client.query('ROLLBACK');
      return response.status(422).json({ success: false, data: null, message: 'That time is not in the doctor’s published schedule.' });
    }
    const result = await client.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status, reason)
       SELECT p.id, $1, $2, $3, 'PENDING', $4 FROM patients p WHERE p.user_id = $5
      RETURNING id, patient_id AS "patientId", doctor_id AS "doctorId",
                to_char(appointment_date, 'YYYY-MM-DD') AS date,
                to_char(appointment_time, 'HH24:MI') AS time, status, reason, created_at AS "createdAt"`,
      [booking.doctorId, booking.date, booking.time, booking.reason, request.user.id],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ success: false, data: null, message: 'Patient profile not found.' });
    }
    await client.query('COMMIT');
    return response.status(201).json({ success: true, data: { appointment: result.rows[0] }, message: 'Appointment requested.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return response.status(409).json({ success: false, data: null, message: 'That appointment slot was just booked. Choose another time.' });
    }
    return next(error);
  } finally { client.release(); }
});

appointmentRouter.patch('/:id/cancel', requireAuth, requireRole('PATIENT'), async (request, response, next) => {
  if (!UUID_PATTERN.test(request.params.id)) return response.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
  try {
    const result = await pool.query(
      `UPDATE appointments a SET status = 'CANCELLED', updated_at = now()
       FROM patients p WHERE p.user_id = $1 AND a.patient_id = p.id AND a.id = $2
         AND a.status IN ('PENDING', 'CONFIRMED')
         AND (a.appointment_date > CURRENT_DATE OR (a.appointment_date = CURRENT_DATE AND a.appointment_time > LOCALTIME))
       RETURNING a.id, a.status`,
      [request.user.id, request.params.id],
    );
    if (result.rowCount) return response.json({ success: true, data: { appointment: result.rows[0] }, message: 'Appointment cancelled.' });
    const owned = await pool.query(
      `SELECT status FROM appointments a JOIN patients p ON p.id = a.patient_id
       WHERE p.user_id = $1 AND a.id = $2`,
      [request.user.id, request.params.id],
    );
    if (!owned.rowCount) return response.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
    return response.status(409).json({ success: false, data: null, message: 'This appointment can no longer be cancelled.' });
  } catch (error) { return next(error); }
});

appointmentRouter.patch('/:id/status', requireAuth, requireRole('DOCTOR'), async (request, response, next) => {
  const { id } = request.params;
  const { status } = request.body ?? {};
  if (!UUID_PATTERN.test(id)) return response.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
  if (!validateDoctorStatus(status)) return response.status(422).json({ success: false, data: null, message: 'Status must be CONFIRMED, REJECTED, or COMPLETED.' });
  try {
    const result = await pool.query(
      `UPDATE appointments a SET status = $1, updated_at = now()
       FROM doctors d WHERE d.user_id = $2 AND a.doctor_id = d.id AND a.id = $3
         AND (($1 = 'CONFIRMED' AND a.status = 'PENDING'
               AND (a.appointment_date > CURRENT_DATE OR (a.appointment_date = CURRENT_DATE AND a.appointment_time > LOCALTIME)))
           OR ($1 = 'REJECTED' AND a.status = 'PENDING')
           OR ($1 = 'COMPLETED' AND a.status = 'CONFIRMED'
               AND (a.appointment_date < CURRENT_DATE OR (a.appointment_date = CURRENT_DATE AND a.appointment_time <= LOCALTIME))))
       RETURNING a.id, a.status, a.updated_at AS "updatedAt"`,
      [status, request.user.id, id],
    );
    if (result.rowCount) {
      return response.json({ success: true, data: { appointment: result.rows[0] }, message: `Appointment ${status.toLowerCase()}.` });
    }
    const owned = await pool.query(
      `SELECT a.status, to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
              to_char(a.appointment_time, 'HH24:MI') AS time,
              (a.appointment_date < CURRENT_DATE OR (a.appointment_date = CURRENT_DATE AND a.appointment_time <= LOCALTIME)) AS "canComplete",
              CURRENT_DATE::text AS "databaseToday", to_char(LOCALTIME, 'HH24:MI') AS "databaseTime"
       FROM appointments a JOIN doctors d ON d.id = a.doctor_id
       WHERE d.user_id = $1 AND a.id = $2`,
      [request.user.id, id],
    );
    if (!owned.rowCount) return response.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
    const appointment = owned.rows[0];
    if (status === 'COMPLETED' && appointment.status !== 'CONFIRMED') {
      return response.status(409).json({ success: false, data: null, message: 'Only confirmed appointments can be marked completed.' });
    }
    if (status === 'COMPLETED' && !appointment.canComplete) {
      return response.status(409).json({ success: false, data: null, message: `This appointment can be completed after its scheduled time (${appointment.date} at ${appointment.time}; server time ${appointment.databaseToday} ${appointment.databaseTime}).` });
    }
    return response.status(409).json({ success: false, data: null, message: 'The appointment status has changed. Refresh the workspace and try again.' });
  } catch (error) { return next(error); }
});

appointmentRouter.get('/:id', requireAuth, async (request, response, next) => {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) return response.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
  try {
    const result = await pool.query(
      `${appointmentSelect} WHERE a.id = $1 AND
        (($2 = 'ADMIN') OR ($2 = 'PATIENT' AND p.user_id = $3) OR ($2 = 'DOCTOR' AND d.user_id = $3))`,
      [id, request.user.role, request.user.id],
    );
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
    return response.json({ success: true, data: { appointment: result.rows[0] }, message: 'Appointment.' });
  } catch (error) { return next(error); }
});
