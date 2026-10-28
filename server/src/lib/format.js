'use strict';

/** Shared helpers for shaping API responses. */

const money = (value) => Number(value || 0);

function pageMeta({ page, pageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** Format a date string (YYYY-MM-DD) for display in Manila. */
function prettyDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(d);
}

/** Compose a "12:00 PM" label from a TIME column. */
function prettyTime(value) {
  if (!value) return null;
  const [h, m] = String(value).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

module.exports = { money, pageMeta, prettyDate, prettyTime, initials };
