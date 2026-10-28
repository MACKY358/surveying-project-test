// Small fetch wrapper for the JSON API.
// Handles the double-submit CSRF contract, FormData uploads and typed errors.

const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields || {};
  }
}

function readCookie(name) {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.split('=').slice(1).join('='));
}

let csrfInFlight = null;

/** Read the readable CSRF cookie, or ask the server to issue one. */
export async function ensureCsrf() {
  const existing = readCookie('trs_csrf');
  if (existing && existing.length === 64) return existing;
  if (!csrfInFlight) {
    csrfInFlight = fetch(`${BASE}/auth/csrf`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const token = data?.csrfToken || readCookie('trs_csrf');
        if (!token) throw new ApiError('Could not establish a secure session. Refresh the page.', 0);
        return token;
      })
      .finally(() => {
        csrfInFlight = null;
      });
  }
  return csrfInFlight;
}

function querySuffix(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    params.set(key, String(value));
  });
  const str = params.toString();
  return str ? `?${str}` : '';
}

async function parseResponse(res) {
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return res.json().catch(() => null);
  }
  const text = await res.text().catch(() => '');
  return text ? { error: text } : null;
}

async function request(path, options = {}) {
  const method = options.method || 'GET';
  const url = `${BASE}${path}${querySuffix(options.query)}`;
  const headers = { Accept: 'application/json' };
  let body;

  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = await ensureCsrf();
  }

  if (options.form) {
    body = options.form; // let the browser set the multipart boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }

  const data = await parseResponse(res);

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    const message =
      (data && (data.error || data.message)) ||
      (res.status === 403
        ? 'You do not have permission to do that.'
        : res.status === 404
          ? 'That record could not be found.'
          : `Request failed (${res.status}).`);
    throw new ApiError(message, res.status, data?.details);
  }

  return data;
}

export const api = {
  get: (path, query, options = {}) => request(path, { ...options, query }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
  del: (path, body, options = {}) => request(path, { ...options, method: 'DELETE', body }),
  upload: (path, form, options = {}) => request(path, { ...options, method: 'POST', form }),
};

/** Download a file through the authenticated API (cookies + no CSRF needed for GET). */
export async function downloadApiFile(path, filename, query) {
  const res = await fetch(`${BASE}${path}${querySuffix(query)}`, {
    credentials: 'same-origin',
    headers: { Accept: '*/*' },
  });
  if (!res.ok) {
    const data = await parseResponse(res);
    throw new ApiError(data?.error || 'The file could not be downloaded.', res.status);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  let name = filename;
  if (!name) {
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const plain = /filename="([^"]+)"/i.exec(disposition);
    name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : 'download';
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Build an authenticated API URL for inline previews (pdf.js, images). */
export function fileUrl(path) {
  return `${BASE}${path}`;
}
