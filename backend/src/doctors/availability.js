export const WEEKDAYS = Object.freeze(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
const TIME_SLOT_PATTERN = /^(?:[01]\d|2[0-3]):(?:00|30)$/;

export function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateAvailability(value) {
  if (!Array.isArray(value) || value.length > WEEKDAYS.length) {
    return { availability: null, error: 'Availability must be a list of up to seven weekdays.' };
  }

  const seenDays = new Set();
  const availability = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { availability: null, error: 'Each availability entry must include a weekday and time slots.' };
    }
    const day = typeof entry.day === 'string' ? entry.day.toUpperCase() : '';
    if (!WEEKDAYS.includes(day) || seenDays.has(day) || !Array.isArray(entry.slots) || entry.slots.length > 32) {
      return { availability: null, error: 'Each weekday must be unique and have a list of no more than 32 slots.' };
    }
    if (entry.slots.some((slot) => typeof slot !== 'string' || !TIME_SLOT_PATTERN.test(slot))) {
      return { availability: null, error: 'Time slots must use 24-hour HH:00 or HH:30 format.' };
    }
    const slots = [...new Set(entry.slots)].sort();
    if (slots.length !== entry.slots.length) return { availability: null, error: 'Duplicate time slots are not allowed.' };
    seenDays.add(day);
    availability.push({ day, slots });
  }
  availability.sort((left, right) => WEEKDAYS.indexOf(left.day) - WEEKDAYS.indexOf(right.day));
  return { availability, error: null };
}

export function slotsForDate(availability, date) {
  const weekdayIndex = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const day = WEEKDAYS[(weekdayIndex + 6) % 7];
  const entry = Array.isArray(availability) ? availability.find((item) => item.day === day) : null;
  return entry?.slots ?? [];
}

export function isSlotTime(value) {
  return typeof value === 'string' && TIME_SLOT_PATTERN.test(value);
}
