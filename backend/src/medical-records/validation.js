import { isValidCalendarDate } from '../doctors/availability.js';
import { UUID_PATTERN } from '../appointments/validation.js';

const MAX = Object.freeze({ diagnosis: 1000, symptoms: 2000, notes: 5000, medicine: 200, dosage: 100, frequency: 100, duration: 100, instructions: 2000 });

function optionalText(body, field, maxLength, updates, required = false) {
  if (!Object.hasOwn(body, field)) return null;
  const value = body[field];
  if (value === null || value === '') {
    if (required) return `${field} is required.`;
    updates[field] = null;
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > maxLength || (required && value.trim().length === 0)) {
    return `${field} must be ${required ? 'non-empty and ' : ''}no more than ${maxLength} characters.`;
  }
  updates[field] = value.trim();
  return null;
}

function followUp(body, updates, required = false) {
  if (!Object.hasOwn(body, 'followUpDate')) {
    return required ? 'followUpDate is required.' : null;
  }
  const value = body.followUpDate;
  if (value === null || value === '') {
    if (required) return 'followUpDate is required.';
    updates.followUpDate = null;
  } else if (!isValidCalendarDate(value)) {
    return 'followUpDate must be a valid YYYY-MM-DD date.';
  } else {
    updates.followUpDate = value;
  }
  return null;
}

export function validateRecordCreate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { record: null, error: 'Provide record fields as a JSON object.' };
  const allowed = new Set(['appointmentId', 'diagnosis', 'symptoms', 'notes', 'followUpDate']);
  if (Object.keys(body).some((field) => !allowed.has(field))) return { record: null, error: 'One or more medical record fields are not supported.' };
  if (typeof body.appointmentId !== 'string' || !UUID_PATTERN.test(body.appointmentId)) return { record: null, error: 'A valid appointmentId is required.' };
  const record = { appointmentId: body.appointmentId };
  const diagnosisError = optionalText(body, 'diagnosis', MAX.diagnosis, record, true);
  if (diagnosisError) return { record: null, error: diagnosisError };
  for (const field of ['symptoms', 'notes']) {
    const error = optionalText(body, field, MAX[field], record);
    if (error) return { record: null, error };
  }
  const followUpError = followUp(body, record);
  return followUpError ? { record: null, error: followUpError } : { record, error: null };
}

export function validateRecordUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { updates: null, error: 'Provide record fields as a JSON object.' };
  const allowed = new Set(['diagnosis', 'symptoms', 'notes', 'followUpDate']);
  if (Object.keys(body).some((field) => !allowed.has(field))) return { updates: null, error: 'One or more medical record fields are not supported.' };
  if (!Object.keys(body).length) return { updates: null, error: 'Provide at least one field to update.' };
  const updates = {};
  for (const field of ['diagnosis', 'symptoms', 'notes']) {
    const error = optionalText(body, field, MAX[field], updates, field === 'diagnosis');
    if (error) return { updates: null, error };
  }
  const dateError = followUp(body, updates);
  return dateError ? { updates: null, error: dateError } : { updates, error: null };
}

export function validatePrescriptionCreate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { prescription: null, error: 'Provide prescription fields as a JSON object.' };
  const allowed = new Set(['medicalRecordId', 'medicine', 'dosage', 'frequency', 'duration', 'instructions']);
  if (Object.keys(body).some((field) => !allowed.has(field))) return { prescription: null, error: 'One or more prescription fields are not supported.' };
  if (typeof body.medicalRecordId !== 'string' || !UUID_PATTERN.test(body.medicalRecordId)) return { prescription: null, error: 'A valid medicalRecordId is required.' };
  const prescription = { medicalRecordId: body.medicalRecordId };
  for (const field of ['medicine', 'dosage', 'frequency', 'duration']) {
    const error = optionalText(body, field, MAX[field], prescription, true);
    if (error) return { prescription: null, error };
  }
  const instructionsError = optionalText(body, 'instructions', MAX.instructions, prescription);
  return instructionsError ? { prescription: null, error: instructionsError } : { prescription, error: null };
}
