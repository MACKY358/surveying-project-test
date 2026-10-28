'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const root = path.join(__dirname, '..');

// One or more comma-separated origins. In development, accept the loopback
// twin (localhost <-> 127.0.0.1) so either URL works when testing.
function withLoopbackTwin(origin) {
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      return url.origin;
    }
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      return url.origin;
    }
  } catch {
    /* ignore malformed origin */
  }
  return null;
}

const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOrigins = new Set(configuredOrigins);
for (const origin of configuredOrigins) {
  const twin = withLoopbackTwin(origin);
  if (twin) allowedOrigins.add(twin);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: num(process.env.PORT, 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  allowedOrigins,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'survey_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'surveying_db',
    poolSize: num(process.env.DB_POOL_SIZE, 10),
  },
  session: {
    secret: process.env.SESSION_SECRET || 'insecure-development-secret',
    ttlHours: num(process.env.SESSION_TTL_HOURS, 12),
    cookieSecure: bool(process.env.COOKIE_SECURE, false),
    cookieName: 'trs_sid',
  },
  trustProxy: bool(process.env.TRUST_PROXY, false),
  uploads: {
    dir: path.resolve(root, process.env.UPLOAD_DIR || './uploads'),
    documentMaxMb: num(process.env.MAX_DOCUMENT_MB, 15),
    blueprintMaxMb: num(process.env.MAX_BLUEPRINT_MB, 60),
  },
  email: {
    enabled: bool(process.env.EMAIL_ENABLED, false),
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Trompeta Surveying <no-reply@example.com>',
  },
};

if (config.isProd) {
  const weakSecret =
    config.session.secret.length < 32 ||
    /development|change-me|generate-a-long-random-secret|insecure/i.test(config.session.secret);
  if (weakSecret) {
    // Fail fast rather than run production with a guessable secret.
    throw new Error('SESSION_SECRET must be at least 32 random characters and must not be a placeholder value in production.');
  }
}

module.exports = config;
