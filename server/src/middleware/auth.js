'use strict';

const crypto = require('crypto');
const { one, query } = require('../db');
const config = require('../config');
const { unauthorized, forbidden } = require('../lib/errors');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.cookieSecure,
    path: '/',
  };
}

/** Create a session row and set the httpOnly cookie. Returns the raw token. */
async function createSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.session.ttlHours * 3600 * 1000);
  await query(
    `INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [
      hashToken(token),
      user.id,
      (req.ip || '').slice(0, 45) || null,
      String(req.get('user-agent') || '').slice(0, 255) || null,
      expires.toISOString().slice(0, 19).replace('T', ' '),
    ],
  );
  res.cookie(config.session.cookieName, token, { ...cookieOptions(), expires });
  return token;
}

async function destroySession(req, res) {
  const token = req.cookies ? req.cookies[config.session.cookieName] : null;
  if (token) {
    await query('DELETE FROM sessions WHERE id = ?', [hashToken(token)]);
  }
  res.clearCookie(config.session.cookieName, { ...cookieOptions() });
}

/**
 * Resolve the acting user from the session cookie on every request.
 * Sessions are server-side, so logout and suspension take effect immediately.
 */
async function loadSession(req, res, next) {
  try {
    const token = req.cookies ? req.cookies[config.session.cookieName] : null;
    if (!token || token.length !== 64) return next();

    const user = await one(
      `SELECT u.id, u.role, u.email, u.full_name, u.phone, u.is_active, u.must_change_password,
              u.privacy_accepted_at, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > NOW() AND u.deleted_at IS NULL`,
      [hashToken(token)],
    );

    if (!user) {
      res.clearCookie(config.session.cookieName, cookieOptions());
      return next();
    }
    if (!user.is_active) {
      await query('DELETE FROM sessions WHERE id = ?', [hashToken(token)]);
      res.clearCookie(config.session.cookieName, cookieOptions());
      return next();
    }

    // Sliding expiry, refreshed at most once a minute.
    await query('UPDATE sessions SET last_seen_at = NOW() WHERE id = ? AND last_seen_at < NOW() - INTERVAL 60 SECOND', [
      hashToken(token),
    ]);

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      must_change_password: !!user.must_change_password,
    };
    req.sessionId = hashToken(token);
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  return next();
}

/** Role gate — always applied server-side, never inferred from the UI. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

const requireAdmin = requireRole('admin');
const requireStaff = requireRole('admin', 'surveyor');
const requireClient = requireRole('client');

/** True when the user may read a given client's confidential records. */
function canAccessClient(user, clientId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'client' && user.id === Number(clientId);
}

/**
 * Surveyors only see projects they lead or are assigned to.
 */
async function canAccessProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'client') {
    const row = await one('SELECT id FROM survey_projects WHERE id = ? AND client_id = ?', [projectId, user.id]);
    return !!row;
  }
  if (user.role === 'surveyor') {
    const row = await one(
      `SELECT p.id FROM survey_projects p
        WHERE p.id = ?
          AND (p.lead_surveyor_id = ?
               OR EXISTS (SELECT 1 FROM project_assignments pa
                           WHERE pa.project_id = p.id AND pa.staff_id = ? AND pa.unassigned_at IS NULL))
        LIMIT 1`,
      [projectId, user.id, user.id],
    );
    return !!row;
  }
  return false;
}

module.exports = {
  createSession,
  destroySession,
  loadSession,
  requireAuth,
  requireRole,
  requireAdmin,
  requireStaff,
  requireClient,
  canAccessClient,
  canAccessProject,
  hashToken,
  cookieOptions,
};
