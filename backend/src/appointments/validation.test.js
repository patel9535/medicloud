import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBookingRequest, validateDoctorStatus } from './validation.js';
import { slotsForDate, validateAvailability } from '../doctors/availability.js';

test('availability validation normalizes weekdays and rejects duplicate or malformed slots', () => {
  const result = validateAvailability([
    { day: 'tuesday', slots: ['09:30', '09:00'] },
    { day: 'MONDAY', slots: ['10:00'] },
  ]);
  assert.equal(result.error, null);
  assert.deepEqual(result.availability, [
    { day: 'MONDAY', slots: ['10:00'] },
    { day: 'TUESDAY', slots: ['09:00', '09:30'] },
  ]);
  assert.match(validateAvailability([{ day: 'MONDAY', slots: ['09:15'] }]).error, /HH:00 or HH:30/);
  assert.match(validateAvailability([{ day: 'MONDAY', slots: ['09:00', '09:00'] }]).error, /Duplicate/);
});

test('weekly schedule resolves a calendar date to the matching available slots', () => {
  const schedule = [{ day: 'MONDAY', slots: ['09:00', '09:30'] }];
  assert.deepEqual(slotsForDate(schedule, '2026-10-26'), ['09:00', '09:30']);
  assert.deepEqual(slotsForDate(schedule, '2026-10-27'), []);
});

test('appointment booking validation accepts synthetic requests and rejects malformed fields', () => {
  const result = validateBookingRequest({
    doctorId: '00000000-0000-4000-8000-000000000001',
    date: '2026-10-26',
    time: '09:30',
    reason: '  Routine visit  ',
  });
  assert.equal(result.error, null);
  assert.equal(result.booking.reason, 'Routine visit');
  assert.match(validateBookingRequest({ doctorId: 'bad', date: '2026-02-30', time: '09:15' }).error, /valid doctor/);
  assert.equal(validateDoctorStatus('CONFIRMED'), true);
  assert.equal(validateDoctorStatus('CANCELLED'), false);
});
