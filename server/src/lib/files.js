'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { badRequest } = require('./errors');

const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

const BLUEPRINT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

function extensionOf(filename) {
  return path.extname(String(filename || '')).replace('.', '').toLowerCase();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function bucketDir(bucket) {
  const dir = path.join(config.uploads.dir, bucket === 'blueprints' ? 'blueprints' : 'documents');
  ensureDir(dir);
  return dir;
}

/** Cryptographically random on-disk name; the client filename is only metadata. */
function storageName(originalName) {
  const ext = extensionOf(originalName);
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext ? `.${ext}` : ''}`;
}

/**
 * Build a Multer disk-storage engine that keeps files out of the web root.
 */
function makeStorage(bucket) {
  const multer = require('multer');
  return multer.diskStorage({
    destination(req, file, cb) {
      try {
        cb(null, bucketDir(bucket));
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      cb(null, storageName(file.originalname));
    },
  });
}

/**
 * Validate an uploaded file against an allow-list of extensions.
 * MIME sniffing is limited on purpose: we accept the browser-declared MIME
 * only when the extension is also allow-listed, and files are never executed
 * or served with an executable content type.
 */
function fileFilter(allowedExtensions) {
  const allowed = new Set(allowedExtensions);
  return (req, file, cb) => {
    const ext = extensionOf(file.originalname);
    if (!allowed.has(ext)) {
      return cb(badRequest(`Unsupported file type ".${ext || 'unknown'}". Allowed: ${[...allowed].join(', ')}.`));
    }
    return cb(null, true);
  };
}

/** Resolve a stored file safely inside its bucket directory. */
function resolveStoredFile(bucket, storedName) {
  const base = bucketDir(bucket);
  const resolved = path.resolve(base, path.basename(String(storedName)));
  if (!resolved.startsWith(path.resolve(base) + path.sep)) {
    throw badRequest('Invalid file reference.');
  }
  return resolved;
}

function removeStoredFile(bucket, storedName) {
  try {
    const file = resolveStoredFile(bucket, storedName);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    console.error('[files] could not remove file:', err.message);
  }
}

function mimeFor(ext, fallback = 'application/octet-stream') {
  return DOCUMENT_TYPES[ext] || BLUEPRINT_TYPES[ext] || fallback;
}

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Content-Disposition that survives non-ASCII filenames. */
function contentDisposition(type, filename) {
  const safe = String(filename || 'download').replace(/[\r\n"]/g, '');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function parseAllowedTypes(csv) {
  return String(csv || 'pdf,jpg,jpeg,png')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = {
  DOCUMENT_TYPES,
  BLUEPRINT_TYPES,
  extensionOf,
  ensureDir,
  bucketDir,
  storageName,
  makeStorage,
  fileFilter,
  resolveStoredFile,
  removeStoredFile,
  mimeFor,
  humanSize,
  contentDisposition,
  parseAllowedTypes,
};
