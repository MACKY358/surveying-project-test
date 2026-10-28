'use strict';

const { HttpError } = require('../lib/errors');

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'The requested endpoint does not exist.' });
}

/* eslint-disable no-unused-vars */
function errorHandler(err, req, res, next) {
  // Multer / upload errors
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'The file is larger than the allowed size for this upload.' });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files in a single upload.' });
  }
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload failed: ${err.message}` });
  }

  // MySQL constraint violations surfaced as friendly messages
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That record already exists. Please use a different value.' });
  }
  if (err && (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED')) {
    return res.status(409).json({ error: 'This record is referenced by other data and cannot be removed.' });
  }
  if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'A related record could not be found.' });
  }

  if (err instanceof HttpError) {
    const payload = { error: err.message };
    if (err.details) payload.details = err.details;
    return res.status(err.status).json(payload);
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }

  console.error('[error]', req.method, req.originalUrl, err);
  const payload = { error: 'Something went wrong on our end. Please try again.' };
  if (process.env.NODE_ENV !== 'production' && err && err.message) payload.debug = err.message;
  return res.status(500).json(payload);
}

module.exports = { notFoundHandler, errorHandler };
