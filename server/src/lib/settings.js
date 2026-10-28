'use strict';

const { query, one } = require('../db');

const DEFAULTS = {
  company_name: 'Trompeta Surveying',
  tagline: 'Licensed land surveying and geodetic engineering',
  about: 'A family-run geodetic engineering practice serving landowners, developers and local government units across Luzon since 2009. We handle relocation surveys, subdivision plans, boundary verification and land title documentation support.',
  address: 'Unit 4B, Rizal Commercial Center, 128 Mabini Street, Barangay Poblacion, San Fernando, Pampanga',
  city: 'San Fernando',
  province: 'Pampanga',
  postal_code: '2000',
  phone: '(045) 861-4420',
  mobile: '+63 917 555 0142',
  email: 'office@trompetasurveying.ph',
  privacy_officer: 'Atty. Maria Lourdes Santos',
  privacy_email: 'privacy@trompetasurveying.ph',
  tin: '004-892-115-000',
  prc_license: 'PRC GE-0028471',
  map_lat: '15.0286',
  map_lng: '120.6898',
  facebook: 'https://facebook.com/trompetasurveying',
  booking_lead_days: '3',
  max_advance_days: '120',
  document_retention_years: '10',
  session_notice: 'For your security, inactive sessions expire automatically.',
  email_notifications_enabled: 'false',
};

/** Read all settings merged over defaults. */
async function getSettings() {
  const rows = await query('SELECT setting_key, setting_value FROM office_settings');
  const map = { ...DEFAULTS };
  for (const row of rows) {
    if (row.setting_value !== null) map[row.setting_key] = row.setting_value;
  }
  return map;
}

async function getSetting(key) {
  const row = await one('SELECT setting_value FROM office_settings WHERE setting_key = ?', [key]);
  if (row && row.setting_value !== null) return row.setting_value;
  return DEFAULTS[key] ?? null;
}

async function setSettings(values, userId) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined);
  for (const [key, value] of entries) {
    // eslint-disable-next-line no-await-in-loop
    await query(
      `INSERT INTO office_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [String(key).slice(0, 80), value === null ? null : String(value), userId || null],
    );
  }
}

async function getBusinessHours() {
  const rows = await query('SELECT * FROM business_hours ORDER BY weekday');
  return rows.map((r) => ({
    weekday: Number(r.weekday),
    openTime: r.open_time,
    closeTime: r.close_time,
    breakStart: r.break_start,
    breakEnd: r.break_end,
    isClosed: !!r.is_closed,
    slotMinutes: Number(r.slot_minutes),
  }));
}

async function setBusinessHours(rows, userId) {
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await query(
      `INSERT INTO business_hours (weekday, open_time, close_time, break_start, break_end, is_closed, slot_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE open_time = VALUES(open_time), close_time = VALUES(close_time),
         break_start = VALUES(break_start), break_end = VALUES(break_end),
         is_closed = VALUES(is_closed), slot_minutes = VALUES(slot_minutes)`,
      [
        row.weekday,
        row.openTime,
        row.closeTime,
        row.breakStart || null,
        row.breakEnd || null,
        row.isClosed ? 1 : 0,
        row.slotMinutes || 60,
      ],
    );
  }
}

module.exports = { DEFAULTS, getSettings, getSetting, setSettings, getBusinessHours, setBusinessHours };
