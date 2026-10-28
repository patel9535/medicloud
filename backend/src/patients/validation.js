const fieldLimits = Object.freeze({
  name: 120,
  gender: 60,
  phone: 40,
  address: 500,
  emergencyContact: 250,
});

const databaseFields = Object.freeze({
  gender: 'gender',
  phone: 'phone',
  address: 'address',
  emergencyContact: 'emergency_contact',
  dateOfBirth: 'date_of_birth',
});

export function validatePatientProfileUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates: null, error: 'Provide profile fields as a JSON object.' };
  }

  const allowed = new Set(['name', 'dateOfBirth', ...Object.keys(databaseFields).filter((key) => key !== 'dateOfBirth')]);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) return { updates: null, error: 'One or more profile fields are not supported.' };
  if (!Object.keys(body).length) return { updates: null, error: 'Provide at least one profile field to update.' };

  const updates = {};
  for (const [field, maxLength] of Object.entries(fieldLimits)) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field];
    if (field === 'name') {
      if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > maxLength) {
        return { updates: null, error: 'Name must be between 2 and 120 characters.' };
      }
      updates.name = value.trim();
    } else if (value === null || value === '') {
      updates[field] = null;
    } else if (typeof value !== 'string' || value.trim().length > maxLength) {
      return { updates: null, error: `${field} must be no more than ${maxLength} characters.` };
    } else {
      updates[field] = value.trim();
    }
  }

  if (Object.hasOwn(body, 'dateOfBirth')) {
    const value = body.dateOfBirth;
    if (value === null || value === '') {
      updates.dateOfBirth = null;
    } else if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10)) {
      return { updates: null, error: 'Date of birth must be a valid date that is not in the future.' };
    } else {
      updates.dateOfBirth = value;
    }
  }

  return { updates, error: null };
}

export function patientProfileColumn(field) {
  return databaseFields[field];
}
