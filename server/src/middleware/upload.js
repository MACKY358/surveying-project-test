'use strict';

const multer = require('multer');
const config = require('../config');
const { makeStorage, fileFilter, DOCUMENT_TYPES, BLUEPRINT_TYPES } = require('../lib/files');

const DOC_EXTENSIONS = Object.keys(DOCUMENT_TYPES);
const PLAN_EXTENSIONS = Object.keys(BLUEPRINT_TYPES);

/** Client document uploads (land titles, IDs, deeds, ...). */
const uploadDocument = multer({
  storage: makeStorage('documents'),
  limits: { fileSize: config.uploads.documentMaxMb * 1024 * 1024, files: 10, fields: 25 },
  fileFilter: fileFilter(DOC_EXTENSIONS),
});

/** Blueprint / survey plan uploads — larger files, drawing formats only. */
const uploadBlueprint = multer({
  storage: makeStorage('blueprints'),
  limits: { fileSize: config.uploads.blueprintMaxMb * 1024 * 1024, files: 5, fields: 20 },
  fileFilter: fileFilter(PLAN_EXTENSIONS),
});

module.exports = { uploadDocument, uploadBlueprint, DOC_EXTENSIONS, PLAN_EXTENSIONS };
