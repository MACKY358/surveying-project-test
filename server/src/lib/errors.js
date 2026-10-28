'use strict';

/** Application error with an HTTP status code and optional field details. */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || null;
    this.expose = true;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg = 'You need to sign in to continue.') => new HttpError(401, msg);
const forbidden = (msg = 'You do not have permission to perform this action.') => new HttpError(403, msg);
const notFound = (msg = 'The requested record was not found.') => new HttpError(404, msg);
const conflict = (msg, details) => new HttpError(409, msg, details);
const tooMany = (msg = 'Too many requests. Please try again later.') => new HttpError(429, msg);

/** Wrap an async route handler so rejections reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooMany,
  asyncHandler,
};
