// Shared formatting, date and status helpers.
// All dates are treated as Asia/Manila wall-clock dates (the office locale).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

function parseISODate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today in Asia/Manila as YYYY-MM-DD. */
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

export function addDaysISO(dateStr, days) {
  const d = parseISODate(dateStr) || new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return toISODate(d);
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfWeekISO(dateStr) {
  const d = parseISODate(dateStr) || new Date();
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
}

export function endOfWeekISO(dateStr) {
  return addDaysISO(startOfWeekISO(dateStr), 6);
}

export function startOfMonthISO(dateStr) {
  const d = parseISODate(dateStr) || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function endOfMonthISO(dateStr) {
  const d = parseISODate(dateStr) || new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toISODate(last);
}

export function dateLabel(value, opts = {}) {
  const d = parseISODate(value);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function dateShort(value) {
  const d = parseISODate(value);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function dateLong(value) {
  const d = parseISODate(value);
  if (!d) return '—';
  return `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function weekdayShort(value) {
  const d = parseISODate(value);
  return d ? WEEKDAYS[d.getDay()] : '';
}

export function monthLabel(value) {
  const d = parseISODate(value);
  if (!d) return '';
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function timeLabel(value) {
  if (!value) return '—';
  const [h, m] = String(value).split(':').map(Number);
  if (Number.isNaN(h)) return String(value);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

export function timeShort(value) {
  if (!value) return '';
  const [h, m] = String(value).split(':').map(Number);
  const suffix = h >= 12 ? 'p' : 'a';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
}

export function dateTimeLabel(value) {
  if (!value) return '—';
  const s = String(value);
  const date = s.slice(0, 10);
  const time = s.slice(11, 16);
  return time ? `${dateLabel(date)} · ${timeLabel(time)}` : dateLabel(date);
}

export function relativeTime(value) {
  if (!value) return '';
  const raw = String(value).replace(' ', 'T');
  const then = new Date(raw);
  if (Number.isNaN(then.getTime())) return '';
  const diff = Date.now() - then.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return dateLabel(String(value).slice(0, 10));
}

export function money(value, opts = {}) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: opts.cents ? 2 : 0,
    minimumFractionDigits: opts.cents ? 2 : 0,
  }).format(n);
}

export function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-PH').format(n) : '0';
}

export function initials(name) {
  return String(name || '')
    .replace(/^(Engr|Atty|Dr|Mr|Mrs|Ms)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';
}

export const STATUS = {
  pending: { label: 'Pending review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  rescheduling_requested: { label: 'Reschedule requested', tone: 'violet' },
  in_progress: { label: 'In progress', tone: 'teal' },
  completed: { label: 'Completed', tone: 'slate' },
  rejected: { label: 'Rejected', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  scheduled: { label: 'Scheduled', tone: 'green' },
  conflict: { label: 'Conflict', tone: 'red' },
  new: { label: 'New', tone: 'amber' },
  read: { label: 'Read', tone: 'blue' },
  responded: { label: 'Responded', tone: 'green' },
  closed: { label: 'Closed', tone: 'slate' },
  open: { label: 'Open', tone: 'green' },
  submitted: { label: 'Submitted', tone: 'amber' },
  under_review: { label: 'Under review', tone: 'blue' },
  superseded: { label: 'Superseded', tone: 'slate' },
  draft: { label: 'Draft', tone: 'slate' },
  for_review: { label: 'For review', tone: 'amber' },
  approved_for_release: { label: 'Approved for release', tone: 'green' },
  archived: { label: 'Archived', tone: 'slate' },
  missing: { label: 'Missing', tone: 'red' },
  active: { label: 'Active', tone: 'green' },
  inactive: { label: 'Inactive', tone: 'slate' },
};

export function statusMeta(status) {
  return STATUS[status] || { label: String(status || '—').replace(/_/g, ' '), tone: 'slate' };
}

export function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fileExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toUpperCase() : 'FILE';
}

export function isImage(mime) {
  return /^image\//.test(String(mime || ''));
}

export function isPdf(mime, name) {
  return String(mime || '') === 'application/pdf' || /\.pdf$/i.test(String(name || ''));
}

export function bytesLabel(value) {
  const n = Number(value) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count, singular, pluralForm) {
  return Number(count) === 1 ? singular : pluralForm || `${singular}s`;
}

/** Query string from an object, skipping empty values. */
export function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

/** Printable date range label. */
export function rangeLabel(from, to) {
  if (!from && !to) return 'All dates';
  if (from === to) return dateLabel(from);
  return `${dateLabel(from)} – ${dateLabel(to)}`;
}

export function stageTone(stage) {
  if (stage === 'completed') return 'green';
  if (stage === 'archived') return 'slate';
  if (stage === 'documents_incomplete') return 'red';
  if (['documents_under_review', 'documents_ready'].includes(stage)) return 'blue';
  if (['field_survey_scheduled', 'field_survey_in_progress'].includes(stage)) return 'teal';
  if (stage === 'appointment_confirmed') return 'green';
  return 'amber';
}

export function roleLabel(role) {
  return role === 'surveyor' ? 'Surveyor' : role === 'admin' ? 'Administrator' : 'Client';
}

export function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'surveyor') return '/staff';
  return '/app';
}

/** Copy text to clipboard with a graceful fallback. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch (err) {
    /* fall through */
  }
  try {
    const area = document.createElement('textarea');
    area.value = String(text);
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch (err) {
    return false;
  }
}

export { MONTHS, MONTHS_LONG, WEEKDAYS, WEEKDAYS_LONG };
