import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrescriptionCreate, validateRecordCreate, validateRecordUpdate } from './validation.js';

const appointmentId = '00000000-0000-4000-8000-000000000001';
const medicalRecordId = '00000000-0000-4000-8000-000000000002';

test('medical record creation requires an appointment and diagnosis, and trims optional fields', () => {
  const result = validateRecordCreate({ appointmentId, diagnosis: '  Follow-up  ', notes: '  Synthetic note  ' });
  assert.equal(result.error, null);
  assert.deepEqual(result.record, { appointmentId, diagnosis: 'Follow-up', notes: 'Synthetic note' });
  assert.match(validateRecordCreate({ appointmentId, diagnosis: ' ' }).error, /diagnosis/);
  assert.match(validateRecordCreate({ appointmentId, diagnosis: 'OK', patientId: 'other' }).error, /not supported/);
});

test('medical record updates validate editable fields and follow-up date', () => {
  const result = validateRecordUpdate({ diagnosis: 'Updated diagnosis', symptoms: null, followUpDate: '2026-11-02' });
  assert.equal(result.error, null);
  assert.deepEqual(result.updates, { diagnosis: 'Updated diagnosis', symptoms: null, followUpDate: '2026-11-02' });
  assert.match(validateRecordUpdate({ followUpDate: '2026-02-30' }).error, /valid YYYY-MM-DD/);
});

test('prescription validation requires medicine instructions and dose fields', () => {
  const result = validatePrescriptionCreate({ medicalRecordId, medicine: 'Example medicine', dosage: '10 mg', frequency: 'Once daily', duration: '5 days' });
  assert.equal(result.error, null);
  assert.equal(result.prescription.instructions, undefined);
  assert.match(validatePrescriptionCreate({ medicalRecordId, medicine: '', dosage: '10 mg', frequency: 'daily', duration: '5 days' }).error, /medicine/);
});
