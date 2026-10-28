import { isValidCalendarDate, isSlotTime } from '../doctors/availability.js';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateBookingRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { booking: null, error: 'Provide appointment details as a JSON object.' };
  }
  const { doctorId, date, time } = body;
  const reason = body.reason == null || body.reason === '' ? null : body.reason;
  if (typeof doctorId !== 'string' || !UUID_PATTERN.test(doctorId)) {
    return { booking: null, error: 'Choose a valid doctor.' };
  }
  if (!isValidCalendarDate(date)) return { booking: null, error: 'Choose a valid appointment date.' };
  if (!isSlotTime(time)) return { booking: null, error: 'Choose a time slot in HH:00 or HH:30 format.' };
  if (reason !== null && (typeof reason !== 'string' || reason.trim().length > 500)) {
    return { booking: null, error: 'Appointment reason must be 500 characters or fewer.' };
  }
  return { booking: { doctorId, date, time, reason: reason?.trim() || null }, error: null };
}

export function validateDoctorStatus(status) {
  return ['CONFIRMED', 'REJECTED', 'COMPLETED'].includes(status);
}
