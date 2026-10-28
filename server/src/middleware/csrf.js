'use strict';

const crypto = require('crypto');
const config = require('../config');
const { forbidden } = require('../lib/errors');

const CSRF_COOKIE = 'trs_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_ORIGINS = new Set([
  ...config.allowedOrigins,
  `http://localhost:${config.port}`,
  `http://127.0.0.1:${config.port}`,
]);

/**
 * Double-submit-cookie CSRF protection.
 *
 *  - A random token is issued in a readable cookie (not httpOnly).
 *  - Every state-changing request must echo it in the X-CSRF-Token header.
 *  - The Origin header is also checked when the browser sends it.
 *
 * Combined with SameSite=Lax session cookies this blocks cross-site
 * form posts and fetch() attempts from other origins.
 */
function issueToken(req, res) {
  // Cache per-request so middleware + route handlers don't each mint a
  // different token and send two conflicting Set-Cookie headers.
  if (req._csrfToken) return req._csrfToken;
  let token = req.cookies ? req.cookies[CSRF_COOKIE] : null;
  if (!token || token.length !== 64) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: config.session.cookieSecure,
      path: '/',
      maxAge: 12 * 60 * 60 * 1000,
    });
  }
  req._csrfToken = token;
  return token;
}

function csrfProtection(req, res, next) {
  issueToken(req, res);
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies ? req.cookies[CSRF_COOKIE] : null;
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken.length !== 64 || headerToken.length !== 64) {
    return next(forbidden('Your security token is missing or expired. Refresh the page and try again.'));
  }
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(forbidden('Your security token is invalid. Refresh the page and try again.'));
  }

  const origin = req.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return next(forbidden('Request origin is not allowed.'));
  }
  return next();
}

module.exports = { csrfProtection, issueToken, CSRF_COOKIE };
