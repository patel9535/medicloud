import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePatientProfileUpdate } from './validation.js';

test('patient profile validation trims fields and permits clearing optional values', () => {
  const result = validatePatientProfileUpdate({ name: '  Demo Patient  ', phone: '  +1 555 0100 ', address: '' });
  assert.equal(result.error, null);
  assert.deepEqual(result.updates, { name: 'Demo Patient', phone: '+1 555 0100', address: null });
});

test('patient profile validation rejects unknown fields and invalid dates', () => {
  assert.match(validatePatientProfileUpdate({ role: 'ADMIN' }).error, /not supported/);
  assert.match(validatePatientProfileUpdate({ dateOfBirth: '2020-02-30' }).error, /valid date/);
  assert.match(validatePatientProfileUpdate({ dateOfBirth: '2999-01-01' }).error, /not in the future/);
  assert.match(validatePatientProfileUpdate({ name: 'A' }).error, /Name must/);
});
