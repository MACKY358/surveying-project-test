'use strict';

const express = require('express');
const fs = require('fs');
const { z } = require('zod');
const { query, one, transaction } = require('../db');
const { asyncHandler, badRequest, forbidden, notFound } = require('../lib/errors');
const { parse, pagination, optionalText, likeTerm, orderBy } = require('../lib/validate');
const { requireAuth, requireStaff, requireAdmin, canAccessProject } = require('../middleware/auth');
const { uploadBlueprint } = require('../middleware/upload');
const { notifyUsers, notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { pageMeta } = require('../lib/format');
const { resolveStoredFile, humanSize, contentDisposition, mimeFor, extensionOf } = require('../lib/files');

const router = express.Router();

const STATUSES = ['draft', 'for_review', 'approved_for_release', 'archived'];
const STATUS_LABEL = {
  draft: 'Draft',
  for_review: 'For Review',
  approved_for_release: 'Approved for Release',
  archived: 'Archived',
};

/* ------------------------------------------------------------------ */
/* List                                                               */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, sort, dir } = parse(pagination, req.query);
    const status = req.query.status ? String(req.query.status) : '';
    const projectId = Number(req.query.projectId) || null;

    const where = ['1 = 1'];
    const params = [];

    if (req.user.role === 'client') {
      where.push('p.client_id = ?');
      where.push('b.status = ?');
      params.push(req.user.id, 'approved_for_release');
    } else if (req.user.role === 'surveyor') {
      where.push(`(p.lead_surveyor_id = ? OR EXISTS (SELECT 1 FROM project_assignments pa
                    WHERE pa.project_id = p.id AND pa.staff_id = ? AND pa.unassigned_at IS NULL))`);
      params.push(req.user.id, req.user.id);
    }

    if (status && status !== 'all') {
      where.push('b.status = ?');
      params.push(status);
    }
    if (projectId) {
      where.push('b.project_id = ?');
      params.push(projectId);
    }
    if (q) {
      const term = likeTerm(q);
      where.push('(b.title LIKE ? OR b.lot_no LIKE ? OR p.project_no LIKE ? OR c.full_name LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const base = `FROM blueprints b
      JOIN survey_projects p ON p.id = b.project_id
      JOIN users c ON c.id = p.client_id
      ${whereSql}`;

    const total = Number((await one(`SELECT COUNT(*) AS total ${base}`, params)).total);
    const order = orderBy(sort, dir, { updated: 'b.updated_at', title: 'b.title' }, 'b.updated_at');

    const rows = await query(
      `SELECT b.*, p.project_no, p.client_id, c.full_name AS client_name,
              (SELECT COUNT(*) FROM blueprint_versions v WHERE v.blueprint_id = b.id) AS version_count,
              (SELECT v.original_name FROM blueprint_versions v WHERE v.blueprint_id = b.id
                ORDER BY v.version_no DESC LIMIT 1) AS latest_file,
              (SELECT v.id FROM blueprint_versions v WHERE v.blueprint_id = b.id
                ORDER BY v.version_no DESC LIMIT 1) AS latest_version_id,
              (SELECT v.mime_type FROM blueprint_versions v WHERE v.blueprint_id = b.id
                ORDER BY v.version_no DESC LIMIT 1) AS latest_mime
       ${base} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );

    res.json({
      blueprints: rows.map((b) => ({
        id: b.id,
        title: b.title,
        lotNo: b.lot_no,
        description: b.description,
        status: b.status,
        statusLabel: STATUS_LABEL[b.status],
        currentVersion: b.current_version,
        versionCount: Number(b.version_count),
        project: { id: b.project_id, projectNo: b.project_no },
        client: { id: b.client_id, name: b.client_name },
        latestFile: b.latest_file,
        latestVersionId: b.latest_version_id,
        latestMime: b.latest_mime,
        fileType: extensionOf(b.latest_file || ''),
        updatedAt: b.updated_at,
        createdAt: b.created_at,
      })),
      meta: pageMeta({ page, pageSize, total }),
      statuses: STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s] })),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Detail with version history                                        */
/* ------------------------------------------------------------------ */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const blueprint = await one(
      `SELECT b.*, p.project_no, p.client_id, p.lead_surveyor_id, c.full_name AS client_name
         FROM blueprints b
         JOIN survey_projects p ON p.id = b.project_id
         JOIN users c ON c.id = p.client_id
        WHERE b.id = ?`,
      [id],
    );
    if (!blueprint) throw notFound('Blueprint not found.');
    if (!(await canAccessProject(req.user, blueprint.project_id))) throw forbidden();

    const whereVersion = req.user.role === 'client' ? `AND v.status = 'approved_for_release'` : '';
    const versions = await query(
      `SELECT v.*, u.full_name AS uploaded_by_name, ab.full_name AS approved_by_name
         FROM blueprint_versions v
         JOIN users u ON u.id = v.uploaded_by
         LEFT JOIN users ab ON ab.id = v.approved_by
        WHERE v.blueprint_id = ? ${whereVersion}
        ORDER BY v.version_no DESC`,
      [id],
    );

    if (req.user.role === 'client' && !versions.length) {
      throw forbidden('This drawing has not been approved for release yet.');
    }

    res.json({
      blueprint: {
        id: blueprint.id,
        title: blueprint.title,
        lotNo: blueprint.lot_no,
        description: blueprint.description,
        status: blueprint.status,
        statusLabel: STATUS_LABEL[blueprint.status],
        currentVersion: blueprint.current_version,
        project: { id: blueprint.project_id, projectNo: blueprint.project_no },
        client: { id: blueprint.client_id, name: blueprint.client_name },
        createdAt: blueprint.created_at,
        updatedAt: blueprint.updated_at,
      },
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version_no,
        fileName: v.original_name,
        mimeType: v.mime_type,
        size: humanSize(v.size_bytes),
        sizeBytes: Number(v.size_bytes),
        revisionNotes: v.revision_notes,
        internalNotes: req.user.role === 'client' ? null : v.internal_notes,
        status: v.status,
        statusLabel: STATUS_LABEL[v.status],
        uploadedBy: v.uploaded_by_name,
        approvedBy: v.approved_by_name,
        approvedAt: v.approved_at,
        createdAt: v.created_at,
      })),
      permissions: {
        canUploadVersion: req.user.role !== 'client',
        canApprove: req.user.role === 'admin',
        canAddNotes: req.user.role !== 'client',
        released: versions.some((v) => v.status === 'approved_for_release'),
      },
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Create blueprint + first version                                   */
/* ------------------------------------------------------------------ */
const createSchema = z.object({
  projectId: z.coerce.number().int().positive('Choose a project.'),
  title: z.string().trim().min(3, 'Enter a drawing title.').max(180),
  lotNo: optionalText(60),
  description: optionalText(2000),
  revisionNotes: optionalText(500),
  status: z.enum(['draft', 'for_review']).optional(),
});

router.post(
  '/',
  requireAuth,
  requireStaff,
  uploadBlueprint.single('file'),
  asyncHandler(async (req, res) => {
    const data = parse(createSchema, req.body);
    if (!req.file) throw badRequest('Attach the drawing file (PDF or image).');
    if (!(await canAccessProject(req.user, data.projectId))) throw forbidden();

    const project = await one('SELECT * FROM survey_projects WHERE id = ?', [data.projectId]);
    if (!project) throw notFound('Project not found.');

    const status = data.status === 'for_review' ? 'for_review' : 'draft';
    const mime = req.file.mimetype && req.file.mimetype !== 'application/octet-stream'
      ? req.file.mimetype
      : mimeFor(extensionOf(req.file.originalname));

    const ids = await transaction(async (conn) => {
      const ins = await conn.execute(
        `INSERT INTO blueprints (project_id, property_id, lot_no, title, description, current_version, status, created_by)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [project.id, project.property_id, data.lotNo, data.title, data.description, status, req.user.id],
      );
      const blueprintId = ins[0].insertId;
      await conn.execute(
        `INSERT INTO blueprint_versions
           (blueprint_id, version_no, original_name, stored_name, mime_type, size_bytes, revision_notes, status, uploaded_by)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        [
          blueprintId,
          req.file.originalname,
          req.file.filename,
          mime,
          req.file.size,
          data.revisionNotes || 'Initial upload',
          status,
          req.user.id,
        ],
      );
      return blueprintId;
    });

    if (req.user.role === 'surveyor') {
      await notifyAdmins({
        type: 'blueprint',
        title: 'Blueprint uploaded',
        message: `${req.user.full_name} uploaded "${data.title}" for ${project.project_no}.`,
        link: `/admin/blueprints`,
      });
    }
    await audit(req, 'blueprint.create', `Blueprint "${data.title}" created for ${project.project_no}`, {
      entityType: 'blueprint',
      entityId: ids,
    });

    res.status(201).json({ ok: true, id: ids, message: 'Drawing uploaded.' });
  }),
);

/* ------------------------------------------------------------------ */
/* New version                                                        */
/* ------------------------------------------------------------------ */
const versionSchema = z.object({
  revisionNotes: z.string().trim().min(3, 'Describe what changed in this revision.').max(500),
  status: z.enum(['draft', 'for_review']).optional(),
});

router.post(
  '/:id/versions',
  requireAuth,
  requireStaff,
  uploadBlueprint.single('file'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(versionSchema, req.body);
    if (!req.file) throw badRequest('Attach the revised drawing file.');

    const blueprint = await one('SELECT * FROM blueprints WHERE id = ?', [id]);
    if (!blueprint) throw notFound('Blueprint not found.');
    if (!(await canAccessProject(req.user, blueprint.project_id))) throw forbidden();

    const status = data.status === 'for_review' ? 'for_review' : 'draft';
    const mime = req.file.mimetype && req.file.mimetype !== 'application/octet-stream'
      ? req.file.mimetype
      : mimeFor(extensionOf(req.file.originalname));

    await transaction(async (conn) => {
      const nextVersion = Number(blueprint.current_version) + 1;
      await conn.execute(
        `INSERT INTO blueprint_versions
           (blueprint_id, version_no, original_name, stored_name, mime_type, size_bytes, revision_notes, status, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          nextVersion,
          req.file.originalname,
          req.file.filename,
          mime,
          req.file.size,
          data.revisionNotes,
          status,
          req.user.id,
        ],
      );
      await conn.execute('UPDATE blueprints SET current_version = ?, status = ? WHERE id = ?', [
        nextVersion,
        status,
        id,
      ]);
    });

    await notifyAdmins({
      type: 'blueprint',
      title: 'New drawing revision',
      message: `${req.user.full_name} uploaded v${Number(blueprint.current_version) + 1} of "${blueprint.title}".`,
      link: '/admin/blueprints',
    });
    await audit(req, 'blueprint.version', `New revision of blueprint #${id}`, {
      entityType: 'blueprint',
      entityId: id,
    });

    res.status(201).json({ ok: true, message: 'New revision uploaded. Previous versions are preserved.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Approval workflow (admin)                                          */
/* ------------------------------------------------------------------ */
const statusSchema = z.object({
  status: z.enum(STATUSES),
  note: optionalText(500),
});

router.patch(
  '/:id/status',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(statusSchema, req.body);
    const blueprint = await one('SELECT * FROM blueprints WHERE id = ?', [id]);
    if (!blueprint) throw notFound('Blueprint not found.');

    const latest = await one(
      'SELECT * FROM blueprint_versions WHERE blueprint_id = ? ORDER BY version_no DESC LIMIT 1',
      [id],
    );
    if (!latest) throw badRequest('This drawing has no uploaded file.');

    await transaction(async (conn) => {
      await conn.execute('UPDATE blueprints SET status = ? WHERE id = ?', [data.status, id]);
      const approved = data.status === 'approved_for_release';
      const approvedAt = approved ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
      if (data.note) {
        await conn.execute(
          `UPDATE blueprint_versions SET status = ?, approved_by = ?, approved_at = ?, internal_notes = ?
            WHERE id = ?`,
          [data.status, approved ? req.user.id : null, approvedAt, data.note, latest.id],
        );
      } else {
        await conn.execute(
          `UPDATE blueprint_versions SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?`,
          [data.status, approved ? req.user.id : null, approvedAt, latest.id],
        );
      }
    });

    const project = await one('SELECT project_no, client_id FROM survey_projects WHERE id = ?', [blueprint.project_id]);

    if (data.status === 'approved_for_release' && project) {
      await notifyUsers(project.client_id, {
        type: 'blueprint',
        title: 'Survey plan released',
        message: `"${blueprint.title}" is now available in your documents.`,
        link: `/app/projects/${blueprint.project_id}`,
      });
    } else if (data.status === 'for_review') {
      await notifyAdmins({
        type: 'blueprint',
        title: 'Drawing needs approval',
        message: `"${blueprint.title}" is awaiting release approval.`,
        link: '/admin/blueprints',
      });
    }

    await audit(req, 'blueprint.status', `Blueprint #${id} set to ${data.status}`, {
      entityType: 'blueprint',
      entityId: id,
    });
    res.json({ ok: true, message: `Drawing marked ${STATUS_LABEL[data.status]}.` });
  }),
);

/* ------------------------------------------------------------------ */
/* Version-level status + internal notes                              */
/* ------------------------------------------------------------------ */
router.patch(
  '/versions/:versionId',
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const versionId = Number(req.params.versionId);
    const schema = z.object({
      internalNotes: optionalText(2000),
      status: z.enum(STATUSES).optional(),
    });
    const data = parse(schema, req.body);

    const version = await one(
      `SELECT v.*, b.project_id, b.title, b.current_version FROM blueprint_versions v
         JOIN blueprints b ON b.id = v.blueprint_id WHERE v.id = ?`,
      [versionId],
    );
    if (!version) throw notFound('Drawing version not found.');
    if (!(await canAccessProject(req.user, version.project_id))) throw forbidden();

    if (data.status && req.user.role !== 'admin') {
      throw forbidden('Only administrators can change the release status.');
    }
    if (data.status === 'approved_for_release' && req.user.role === 'admin') {
      throw badRequest('Use the approval action so the release is recorded correctly.');
    }

    await query(
      `UPDATE blueprint_versions
          SET internal_notes = COALESCE(?, internal_notes), status = COALESCE(?, status)
        WHERE id = ?`,
      [data.internalNotes, data.status || null, versionId],
    );
    if (data.status) {
      await query('UPDATE blueprints SET status = ? WHERE project_id = ? AND id = ?', [
        data.status,
        version.project_id,
        version.blueprint_id,
      ]);
    }
    await audit(req, 'blueprint.version_update', `Updated drawing version #${versionId}`, {
      entityType: 'blueprint',
      entityId: version.blueprint_id,
    });
    res.json({ ok: true, message: 'Drawing notes saved.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Secure file access                                                 */
/* ------------------------------------------------------------------ */
async function loadVersionForUser(req) {
  const versionId = Number(req.params.versionId);
  const version = await one(
    `SELECT v.*, b.project_id, b.title, b.status AS blueprint_status
       FROM blueprint_versions v JOIN blueprints b ON b.id = v.blueprint_id
      WHERE v.id = ?`,
    [versionId],
  );
  if (!version) throw notFound('Drawing file not found.');
  if (!(await canAccessProject(req.user, version.project_id))) throw forbidden();

  if (req.user.role === 'client' && version.status !== 'approved_for_release') {
    throw forbidden('This drawing has not been approved for release.');
  }
  return version;
}

function streamVersion(req, res, version, disposition) {
  const filePath = resolveStoredFile('blueprints', version.stored_name);
  if (!fs.existsSync(filePath)) throw notFound('The stored drawing file is missing.');
  res.setHeader('Content-Type', version.mime_type || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', contentDisposition(disposition, version.original_name));
  fs.createReadStream(filePath).pipe(res);
}

router.get(
  '/versions/:versionId/file',
  requireAuth,
  asyncHandler(async (req, res) => {
    const version = await loadVersionForUser(req);
    streamVersion(req, res, version, 'inline');
  }),
);

router.get(
  '/versions/:versionId/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const version = await loadVersionForUser(req);
    await audit(req, 'blueprint.download', `Downloaded drawing version #${version.id}`, {
      entityType: 'blueprint',
      entityId: version.blueprint_id,
    });
    streamVersion(req, res, version, 'attachment');
  }),
);

/* ------------------------------------------------------------------ */
/* Archive blueprint                                                  */
/* ------------------------------------------------------------------ */
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const blueprint = await one('SELECT * FROM blueprints WHERE id = ?', [id]);
    if (!blueprint) throw notFound('Blueprint not found.');
    await query(`UPDATE blueprints SET status = 'archived' WHERE id = ?`, [id]);
    await query(`UPDATE blueprint_versions SET status = 'archived' WHERE blueprint_id = ?`, [id]);
    await audit(req, 'blueprint.archive', `Archived blueprint #${id}`, { entityType: 'blueprint', entityId: id });
    res.json({ ok: true, message: 'Drawing archived. Files are retained for records.' });
  }),
);

module.exports = router;
