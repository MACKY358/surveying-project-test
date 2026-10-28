'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { pool } = require('./db');
const { loadSession } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { ensureDir } = require('./lib/files');

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Inline styles are used by charting and progress bars.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", 'blob:'],
        objectSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'same-origin' },
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// Health probe (no auth, no sensitive data)
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, uptime: Math.round(process.uptime()), env: config.env });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

// Session + CSRF apply to every API route.
app.use('/api', apiLimiter, loadSession, csrfProtection);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/blueprints', require('./routes/blueprints'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/admin/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', notFoundHandler);

/* ------------------------------------------------------------------ */
/* Production: serve the built SPA from the same origin               */
/* ------------------------------------------------------------------ */
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        if (/\.(js|css|woff2?|png|jpg|svg)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
} else if (config.isProd) {
  console.warn('[start] client/dist not found — run "npm run build" before starting in production.');
}

app.use(errorHandler);

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */
async function start() {
  ensureDir(config.uploads.dir);
  ensureDir(path.join(config.uploads.dir, 'documents'));
  ensureDir(path.join(config.uploads.dir, 'blueprints'));

  try {
    await pool.query('SELECT 1');
    console.log(`[db] connected to ${config.db.database} at ${config.db.host}:${config.db.port}`);
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    console.error('     Check server/.env and make sure the database is running.');
    process.exitCode = 1;
    return;
  }

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port} (${config.env})`);
    if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
      console.log(`[api] dev mode: open the Vite app on ${config.clientOrigin}`);
    }
  });

  const shutdown = (signal) => {
    console.log(`\n[api] ${signal} received, shutting down...`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();

module.exports = app;
