'use strict';

const rateLimit = require('express-rate-limit');

const message = (text) => ({ error: text });

/** Generous global API budget — protects against scraping and runaway loops.
 *  An office team can share one public IP, so keep this well above normal use. */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many requests. Please slow down and try again shortly.'),
});

/** Brute-force protection: per-IP, tight window. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many sign-in attempts. Please wait 15 minutes and try again.'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many accounts created from this network. Please try again later.'),
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many uploads in a short period. Please wait a few minutes.'),
});

const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many inquiries sent. Please try again later.'),
});

module.exports = { apiLimiter, loginLimiter, registerLimiter, uploadLimiter, inquiryLimiter };
