import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { isValidCalendarDate, slotsForDate, validateAvailability } from './availability.js';

export const doctorRouter = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const publicDoctorSelect = `SELECT d.id, u.name, d.specialization,
  dep.name AS department, d.experience_years AS "experienceYears", d.availability
  FROM doctors d JOIN users u ON u.id = d.user_id
  LEFT JOIN departments dep ON dep.id = d.department_id`;

doctorRouter.get('/me', requireAuth, requireRole('DOCTOR'), async (request, response, next) => {
  try {
    const result = await pool.query(
      `${publicDoctorSelect} WHERE d.user_id = $1`,
      [request.user.id],
    );
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Doctor profile not found.' });
    return response.json({ success: true, data: { doctor: result.rows[0] }, message: 'Doctor profile.' });
  } catch (error) { return next(error); }
});

doctorRouter.put('/me/availability', requireAuth, requireRole('DOCTOR'), async (request, response, next) => {
  const { availability, error } = validateAvailability(request.body?.availability);
  if (error) return response.status(422).json({ success: false, data: null, message: error });
  try {
    const result = await pool.query(
      'UPDATE doctors SET availability = $1::jsonb, updated_at = now() WHERE user_id = $2 RETURNING id, availability',
      [JSON.stringify(availability), request.user.id],
    );
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Doctor profile not found.' });
    return response.json({ success: true, data: { availability: result.rows[0].availability }, message: 'Availability updated.' });
  } catch (requestError) { return next(requestError); }
});

doctorRouter.get('/me/dashboard', requireAuth, requireRole('DOCTOR'), async (request, response, next) => {
  try {
    const doctorResult = await pool.query('SELECT id, availability FROM doctors WHERE user_id = $1', [request.user.id]);
    if (!doctorResult.rowCount) return response.status(404).json({ success: false, data: null, message: 'Doctor profile not found.' });
    const doctorId = doctorResult.rows[0].id;
    const [appointments, counts] = await Promise.all([
      pool.query(
        `SELECT a.id, to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
                to_char(a.appointment_time, 'HH24:MI') AS time, a.status,
                p.id AS "patientId", u.name AS "patientName"
         FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = p.user_id
         WHERE a.doctor_id = $1 AND a.appointment_date >= CURRENT_DATE
           AND a.status IN ('PENDING', 'CONFIRMED')
         ORDER BY a.appointment_date, a.appointment_time LIMIT 10`,
        [doctorId],
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE appointment_date = CURRENT_DATE)::integer AS today,
                COUNT(*) FILTER (WHERE appointment_date >= CURRENT_DATE)::integer AS upcoming
         FROM appointments WHERE doctor_id = $1 AND status IN ('PENDING', 'CONFIRMED')`,
        [doctorId],
      ),
    ]);
    return response.json({
      success: true,
      data: { doctorAvailability: doctorResult.rows[0].availability, todayCount: counts.rows[0].today, upcomingCount: counts.rows[0].upcoming, upcomingAppointments: appointments.rows },
      message: 'Doctor dashboard.',
    });
  } catch (error) { return next(error); }
});

doctorRouter.get('/:id/availability', async (request, response, next) => {
  const { id } = request.params;
  const date = typeof request.query.date === 'string' ? request.query.date : '';
  if (!UUID_PATTERN.test(id)) return response.status(404).json({ success: false, data: null, message: 'Doctor not found.' });
  if (!isValidCalendarDate(date)) return response.status(422).json({ success: false, data: null, message: 'Provide a valid date in YYYY-MM-DD format.' });
  try {
    const [doctor, clock] = await Promise.all([
      pool.query('SELECT id, availability FROM doctors WHERE id = $1', [id]),
      pool.query("SELECT CURRENT_DATE::text AS today, to_char(LOCALTIME, 'HH24:MI') AS \"currentTime\""),
    ]);
    if (!doctor.rowCount) return response.status(404).json({ success: false, data: null, message: 'Doctor not found.' });
    const { today, currentTime } = clock.rows[0];
    if (date < today) return response.status(422).json({ success: false, data: null, message: 'Choose today or a future date.' });
    const configuredSlots = slotsForDate(doctor.rows[0].availability, date);
    const booked = await pool.query(
      `SELECT to_char(appointment_time, 'HH24:MI') AS time FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2
         AND status IN ('PENDING', 'CONFIRMED', 'COMPLETED')`,
      [id, date],
    );
    const takenSlots = new Set(booked.rows.map((row) => row.time));
    const availableSlots = configuredSlots.filter((slot) => !takenSlots.has(slot) && (date !== today || slot > currentTime));
    return response.json({ success: true, data: { doctorId: id, date, slots: availableSlots }, message: 'Available appointment slots.' });
  } catch (error) { return next(error); }
});

doctorRouter.get('/', async (request, response, next) => {
  const specialization = typeof request.query.specialization === 'string' ? request.query.specialization.trim() : '';
  if (specialization.length > 80) {
    return response.status(422).json({ success: false, data: null, message: 'Specialization search must be 80 characters or fewer.' });
  }
  try {
    const result = await pool.query(
      `${publicDoctorSelect}
       WHERE ($1 = '' OR d.specialization ILIKE '%' || $1 || '%')
       ORDER BY d.specialization, u.name LIMIT 100`,
      [specialization],
    );
    return response.json({ success: true, data: { doctors: result.rows }, message: 'Doctor directory.' });
  } catch (error) { return next(error); }
});

doctorRouter.get('/:id', async (request, response, next) => {
  if (!UUID_PATTERN.test(request.params.id)) {
    return response.status(404).json({ success: false, data: null, message: 'Doctor not found.' });
  }
  try {
    const result = await pool.query(`${publicDoctorSelect} WHERE d.id = $1`, [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ success: false, data: null, message: 'Doctor not found.' });
    return response.json({ success: true, data: { doctor: result.rows[0] }, message: 'Doctor profile.' });
  } catch (error) { return next(error); }
});
