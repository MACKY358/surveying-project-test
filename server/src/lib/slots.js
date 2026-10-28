'use strict';

const { query } = require('../db');
const { conflict } = require('./errors');

/** Statuses that occupy a slot. `pending` requests do not block the calendar. */
const BLOCKING_STATUSES = ['approved', 'confirmed', 'in_progress'];

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

const toHHMM = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
};

/** Manila-local "today" (the office operates in Asia/Manila). */
function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

/** Minimum lead time in days before a survey can be booked. */
const MIN_LEAD_DAYS = 1;

async function businessHoursFor(dateStr) {
  const weekday = weekdayOf(dateStr);
  const rows = await query('SELECT * FROM business_hours WHERE weekday = ?', [weekday]);
  return rows[0] || null;
}

/**
 * Build bookable slots for one day.
 * @returns {Promise<{date: string, closed: boolean, reason?: string, slots: Array}>}
 */
async function dayAvailability(dateStr, durationMinutes = 120, options = {}) {
  const hours = await businessHoursFor(dateStr);
  if (!hours || hours.is_closed) {
    return { date: dateStr, closed: true, reason: 'The office is closed on this day.', slots: [] };
  }

  const today = todayManila();
  if (dateStr < today) {
    return { date: dateStr, closed: true, reason: 'This date is in the past.', slots: [] };
  }
  if (dateStr < addDays(today, MIN_LEAD_DAYS)) {
    return { date: dateStr, closed: true, reason: `Bookings require at least ${MIN_LEAD_DAYS} day of lead time.`, slots: [] };
  }

  const busy = await query(
    `SELECT preferred_time, duration_minutes FROM appointments
      WHERE preferred_date = ? AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
      ${options.surveyorId ? 'AND assigned_surveyor_id = ?' : ''}
      ${options.excludeAppointmentId ? 'AND id <> ?' : ''}`,
    [
      dateStr,
      ...BLOCKING_STATUSES,
      ...(options.surveyorId ? [options.surveyorId] : []),
      ...(options.excludeAppointmentId ? [options.excludeAppointmentId] : []),
    ],
  );

  const breaks = [];
  if (hours.break_start && hours.break_end) {
    breaks.push([toMinutes(hours.break_start), toMinutes(hours.break_end)]);
  }

  const step = Number(hours.slot_minutes) || 60;
  const open = toMinutes(hours.open_time);
  const close = toMinutes(hours.close_time);
  const slotLength = Number(durationMinutes) || 60;

  const slots = [];
  for (let start = open; start + slotLength <= close; start += step) {
    const end = start + slotLength;
    let available = true;
    let reason = null;

    if (breaks.some(([bStart, bEnd]) => start < bEnd && end > bStart)) {
      available = false;
      reason = 'Office break';
    }

    if (available) {
      for (const appt of busy) {
        const aStart = toMinutes(appt.preferred_time);
        const aEnd = aStart + (Number(appt.duration_minutes) || 60);
        if (start < aEnd && end > aStart) {
          available = false;
          reason = 'Already booked';
          break;
        }
      }
    }

    // Same-day bookings must still allow enough notice (2 hours).
    if (available && dateStr === today) {
      const nowManila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const nowMinutes = nowManila.getHours() * 60 + nowManila.getMinutes();
      if (start < nowMinutes + 120) {
        available = false;
        reason = 'Too soon';
      }
    }

    slots.push({ time: toHHMM(start), endTime: toHHMM(end), label: formatSlot(start), available, reason });
  }

  return { date: dateStr, closed: false, hours, slots };
}

function formatSlot(minutes) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Throw a 409 if the surveyor (or the client) already has an overlap.
 * Called on approval/assignment/confirmation — never trust the client.
 */
async function assertNoConflict({ date, time, duration, surveyorId, clientId, excludeAppointmentId = null }) {
  const start = toMinutes(time);
  const end = start + (Number(duration) || 60);

  const rows = await query(
    `SELECT a.id, a.reference_no, a.preferred_time, a.duration_minutes, a.assigned_surveyor_id, a.client_id,
            u.full_name AS surveyor_name, c.full_name AS client_name
       FROM appointments a
       LEFT JOIN users u ON u.id = a.assigned_surveyor_id
       LEFT JOIN users c ON c.id = a.client_id
      WHERE a.preferred_date = ?
        AND a.status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
        ${excludeAppointmentId ? 'AND a.id <> ?' : ''}
        AND (a.assigned_surveyor_id = ? ${clientId ? 'OR a.client_id = ?' : ''})`,
    [
      date,
      ...BLOCKING_STATUSES,
      ...(excludeAppointmentId ? [excludeAppointmentId] : []),
      surveyorId || 0,
      ...(clientId ? [clientId] : []),
    ],
  );

  for (const row of rows) {
    const otherStart = toMinutes(row.preferred_time);
    const otherEnd = otherStart + (Number(row.duration_minutes) || 60);
    if (start < otherEnd && end > otherStart) {
      const who =
        row.assigned_surveyor_id && row.assigned_surveyor_id === surveyorId
          ? `surveyor ${row.surveyor_name || ''}`.trim()
          : `the same client (${row.client_name || 'client'})`;
      throw conflict(
        'This time slot is no longer available. Please choose another date or time.',
        { appointmentId: row.id, reference: row.reference_no, clashesWith: who },
      );
    }
  }
}

/** Count how many active bookings a surveyor already has on a date. */
async function surveyorLoad(surveyorId, date, excludeAppointmentId = null) {
  const row = await query(
    `SELECT COUNT(*) AS total FROM appointments
      WHERE assigned_surveyor_id = ? AND preferred_date = ?
        AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
        ${excludeAppointmentId ? 'AND id <> ?' : ''}`,
    [surveyorId, date, ...BLOCKING_STATUSES, ...(excludeAppointmentId ? [excludeAppointmentId] : [])],
  );
  return Number(row[0] ? row[0].total : 0);
}

/** Date-range availability summary used by the booking calendar. */
async function rangeAvailability(from, to, durationMinutes) {
  const days = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 120) {
    // eslint-disable-next-line no-await-in-loop
    const day = await dayAvailability(cursor, durationMinutes);
    days.push({ date: day.date, closed: day.closed, availableCount: day.slots.filter((s) => s.available).length });
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

module.exports = {
  BLOCKING_STATUSES,
  MIN_LEAD_DAYS,
  todayManila,
  addDays,
  weekdayOf,
  toMinutes,
  toHHMM,
  businessHoursFor,
  dayAvailability,
  rangeAvailability,
  assertNoConflict,
  surveyorLoad,
  formatSlot,
};
