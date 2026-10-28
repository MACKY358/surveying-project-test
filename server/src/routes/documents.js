'use strict';

const express = require('express');
const fs = require('fs');
const { z } = require('zod');
const { query, one, transaction, tquery } = require('../db');
const { asyncHandler, badRequest, forbidden, notFound } = require('../lib/errors');
const { parse, pagination, optionalText, likeTerm, orderBy } = require('../lib/validate');
const { requireAuth, requireAdmin, canAccessProject } = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');
const { notifyUsers, notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { pageMeta } = require('../lib/format');
const {
  resolveStoredFile,
  removeStoredFile,
  humanSize,
  contentDisposition,
  parseAllowedTypes,
} = require('../lib/files');

const router = express.Router();

const MAX_REVIEW_NOTE = 500;

/* ------------------------------------------------------------------ */
/* Requirement checklist for a service or project                      */
/* ------------------------------------------------------------------ */
router.get(
  '/requirements',
  requireAuth,
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.query.serviceId) || null;
    const projectId = Number(req.query.projectId) || null;

    let service = serviceId;
    let project = null;

    if (projectId) {
      if (!(await canAccessProject(req.user, projectId))) throw forbidden();
      project = await one('SELECT * FROM survey_projects WHERE id = ?', [projectId]);
      if (!project) throw notFound('Project not found.');
      service = project.service_id;
    }

    const requirements = await query(
      `SELECT * FROM document_requirements
        WHERE is_active = 1 AND (service_id = ? OR service_id IS NULL)
        ORDER BY sort_order, id`,
      [service || 0],
    );

    const docs = project
      ? await query(
          `SELECT id, requirement_id, title, status, version, review_notes, original_name, created_at
             FROM property_documents
            WHERE project_id = ? AND deleted_at IS NULL
            ORDER BY created_at DESC`,
          [project.id],
        )
      : [];

    const items = requirements.map((r) => {
      const mine = docs.filter((d) => d.requirement_id === r.id);
      const latest = mine[0] || null;
      const approved = mine.find((d) => d.status === 'approved');
      const rejected = mine.find((d) => d.status === 'rejected');
      const pending = mine.find((d) => ['submitted', 'under_review'].includes(d.status));
      const status = approved ? 'approved' : rejected ? 'rejected' : pending ? pending.status : 'missing';
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        isRequired: !!r.is_required,
        allowedTypes: parseAllowedTypes(r.allowed_types),
        maxSizeMb: Number(r.max_size_mb),
        status,
        latestDocument: latest
          ? {
              id: latest.id,
              status: latest.status,
              version: latest.version,
              fileName: latest.original_name,
              uploadedAt: latest.created_at,
              reviewNotes: latest.review_notes,
            }
          : null,
        documentCount: mine.length,
      };
    });

    res.json({
      requirements: items,
      summary: {
        total: items.length,
        required: items.filter((i) => i.isRequired).length,
        approved: items.filter((i) => i.status === 'approved').length,
        missing: items.filter((i) => i.isRequired && i.status === 'missing').length,
        rejected: items.filter((i) => i.status === 'rejected').length,
      },
    });
  }),
);

/* ------------------------------------------------------------------ */
/* List documents                                                     */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, sort, dir } = parse(pagination, req.query);
    const status = req.query.status ? String(req.query.status) : '';
    const category = req.query.category ? String(req.query.category) : '';
    const projectId = Number(req.query.projectId) || null;
    const clientId = Number(req.query.clientId) || null;
    const pendingReview = req.query.review === 'pending';

    const where = ['d.deleted_at IS NULL'];
    const params = [];

    if (req.user.role === 'client') {
      where.push('d.client_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'surveyor') {
      where.push(`EXISTS (
        SELECT 1 FROM survey_projects p
         WHERE p.id = d.project_id
           AND (p.lead_surveyor_id = ?
                OR EXISTS (SELECT 1 FROM project_assignments pa
                            WHERE pa.project_id = p.id AND pa.staff_id = ? AND pa.unassigned_at IS NULL))
      )`);
      params.push(req.user.id, req.user.id);
    } else if (clientId) {
      where.push('d.client_id = ?');
      params.push(clientId);
    }

    if (status && status !== 'all') {
      const list = status.split(',').filter(Boolean);
      where.push(`d.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (category) {
      where.push('d.category = ?');
      params.push(category);
    }
    if (projectId) {
      where.push('d.project_id = ?');
      params.push(projectId);
    }
    if (pendingReview) {
      where.push(`d.status IN ('submitted','under_review')`);
    }
    if (q) {
      where.push('(d.title LIKE ? OR d.original_name LIKE ? OR c.full_name LIKE ? OR p.project_no LIKE ?)');
      const term = likeTerm(q);
      params.push(term, term, term, term);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const base = `
      FROM property_documents d
      JOIN users c ON c.id = d.client_id
      LEFT JOIN survey_projects p ON p.id = d.project_id
      LEFT JOIN document_requirements dr ON dr.id = d.requirement_id
      LEFT JOIN users rv ON rv.id = d.reviewed_by
      ${whereSql}`;

    const total = Number((await one(`SELECT COUNT(*) AS total ${base}`, params)).total);
    const order = orderBy(sort, dir, { created: 'd.created_at', status: 'd.status' }, 'd.created_at');

    const rows = await query(
      `SELECT d.*, c.full_name AS client_name, p.project_no, dr.name AS requirement_name,
              rv.full_name AS reviewed_by_name
       ${base} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );

    res.json({
      documents: rows.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        requirementName: d.requirement_name,
        originalName: d.original_name,
        mimeType: d.mime_type,
        sizeBytes: Number(d.size_bytes),
        size: humanSize(d.size_bytes),
        status: d.status,
        version: d.version,
        client: { id: d.client_id, name: d.client_name },
        project: d.project_id ? { id: d.project_id, projectNo: d.project_no } : null,
        uploadedBy: d.uploaded_by,
        reviewedBy: d.reviewed_by_name,
        reviewNotes: d.review_notes,
        reviewedAt: d.reviewed_at,
        createdAt: d.created_at,
      })),
      meta: pageMeta({ page, pageSize, total }),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Upload (new document or new version)                               */
/* ------------------------------------------------------------------ */
const uploadSchema = z.object({
  projectId: z.coerce.number().int().positive().optional().nullable(),
  appointmentId: z.coerce.number().int().positive().optional().nullable(),
  propertyId: z.coerce.number().int().positive().optional().nullable(),
  requirementId: z.coerce.number().int().positive().optional().nullable(),
  category: optionalText(80),
  title: optionalText(180),
});

router.post(
  '/',
  requireAuth,
  uploadDocument.array('files', 10),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (!files.length) throw badRequest('Choose at least one file to upload.');
    const data = parse(uploadSchema, req.body);

    let project = null;
    if (data.projectId) {
      if (!(await canAccessProject(req.user, data.projectId))) throw forbidden();
      project = await one('SELECT * FROM survey_projects WHERE id = ?', [data.projectId]);
      if (!project) throw notFound('Project not found.');
    }

    let requirement = null;
    if (data.requirementId) {
      requirement = await one('SELECT * FROM document_requirements WHERE id = ? AND is_active = 1', [
        data.requirementId,
      ]);
      if (!requirement) throw badRequest('That document requirement no longer exists.');

      const allowed = parseAllowedTypes(requirement.allowed_types);
      const badFile = files.find((f) => !allowed.includes(String(f.originalname).split('.').pop().toLowerCase()));
      if (badFile) {
        throw badRequest(
          `"${requirement.name}" accepts ${allowed.join(', ')} only. "${badFile.originalname}" is not allowed.`,
        );
      }
      const over = files.find((f) => f.size > Number(requirement.max_size_mb) * 1024 * 1024);
      if (over) {
        throw badRequest(`"${over.originalname}" exceeds the ${requirement.max_size_mb} MB limit for this requirement.`);
      }
    }

    const clientId = req.user.role === 'client' ? req.user.id : project ? project.client_id : Number(req.body.clientId);
    if (!clientId) throw badRequest('Select the client or project this document belongs to.');
    if (req.user.role === 'surveyor' && !project) throw badRequest('Select a project for this upload.');

    const created = await transaction(async (conn) => {
      const ids = [];
      for (const file of files) {
        let version = 1;
        let supersedesId = null;

        if (requirement && project) {
          const prev = await tquery(
            conn,
            `SELECT id, version FROM property_documents
              WHERE project_id = ? AND requirement_id = ? AND deleted_at IS NULL
              ORDER BY version DESC LIMIT 1`,
            [project.id, requirement.id],
          );
          if (prev.length) {
            version = Number(prev[0].version) + 1;
            supersedesId = prev[0].id;
            await tquery(conn, `UPDATE property_documents SET status = 'superseded' WHERE id = ?`, [prev[0].id]);
          }
        }

        const title = data.title || (requirement ? requirement.name : file.originalname);
        const category = data.category || (requirement ? requirement.code : 'other');

        const result = await conn.execute(
          `INSERT INTO property_documents
             (property_id, client_id, project_id, appointment_id, requirement_id, category, title,
              original_name, stored_name, mime_type, size_bytes, status, version, supersedes_id, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
          [
            data.propertyId || (project ? project.property_id : null),
            clientId,
            project ? project.id : null,
            data.appointmentId || (project ? project.appointment_id : null),
            requirement ? requirement.id : null,
            category,
            title,
            file.originalname,
            file.filename,
            file.mimetype,
            file.size,
            version,
            supersedesId,
            req.user.id,
          ],
        );
        ids.push({ id: result[0].insertId, name: file.originalname });
      }
      return ids;
    });

    if (req.user.role !== 'admin') {
      await notifyAdmins({
        type: 'document',
        title: 'Documents uploaded',
        message: `${req.user.full_name} uploaded ${created.length} file(s)${
          project ? ` for ${project.project_no}` : ''
        }.`,
        link: '/admin/documents',
      });
    } else if (project) {
      await notifyUsers(project.client_id, {
        type: 'document',
        title: 'Document uploaded by the office',
        message: `The office added ${created.length} file(s) to ${project.project_no}.`,
        link: `/app/projects/${project.id}`,
      });
    }

    await audit(req, 'document.upload', `Uploaded ${created.length} document(s)`, {
      entityType: project ? 'project' : 'document',
      entityId: project ? project.id : null,
    });

    res.status(201).json({ ok: true, uploaded: created, message: `${created.length} file(s) uploaded successfully.` });
  }),
);

/* ------------------------------------------------------------------ */
/* Review (admin)                                                     */
/* ------------------------------------------------------------------ */
const reviewSchema = z.object({
  status: z.enum(['under_review', 'approved', 'rejected']),
  notes: optionalText(MAX_REVIEW_NOTE),
});

router.patch(
  '/:id/review',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(reviewSchema, req.body);
    const doc = await one(
      `SELECT d.*, p.project_no FROM property_documents d
        LEFT JOIN survey_projects p ON p.id = d.project_id
       WHERE d.id = ? AND d.deleted_at IS NULL`,
      [id],
    );
    if (!doc) throw notFound('Document not found.');
    if (data.status === 'rejected' && !data.notes) {
      throw badRequest('Explain what needs to be corrected so the client can resubmit.', {
        notes: 'Required when rejecting.',
      });
    }

    await query(
      `UPDATE property_documents SET status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [data.status, data.notes, req.user.id, id],
    );

    const label =
      data.status === 'approved' ? 'approved' : data.status === 'rejected' ? 'needs correction' : 'is under review';
    await notifyUsers(doc.client_id, {
      type: 'document',
      title: `Document ${label}`,
      message: `"${doc.title}" ${label}.${data.notes ? ` Note: ${data.notes}` : ''}`,
      link: doc.project_id ? `/app/projects/${doc.project_id}` : '/app/documents',
    });
    await audit(req, 'document.review', `Document #${id} marked ${data.status}`, {
      entityType: 'document',
      entityId: id,
    });

    res.json({ ok: true, message: `Document marked ${data.status.replace('_', ' ')}.` });
  }),
);

/* ------------------------------------------------------------------ */
/* Delete / archive                                                   */
/* ------------------------------------------------------------------ */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const doc = await one('SELECT * FROM property_documents WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!doc) throw notFound('Document not found.');

    if (req.user.role === 'client') {
      if (doc.client_id !== req.user.id) throw forbidden();
      if (['approved', 'under_review'].includes(doc.status)) {
        throw badRequest('Reviewed documents cannot be deleted. Upload a replacement version instead.');
      }
    } else if (req.user.role === 'surveyor') {
      throw forbidden();
    }

    await query('UPDATE property_documents SET deleted_at = NOW() WHERE id = ?', [id]);
    if (req.user.role === 'client') {
      removeStoredFile('documents', doc.stored_name);
    }
    await audit(req, 'document.delete', `Document #${id} removed`, { entityType: 'document', entityId: id });
    res.json({ ok: true, message: 'Document removed.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Secure file access                                                 */
/* ------------------------------------------------------------------ */
async function loadDocumentForUser(req) {
  const id = Number(req.params.id);
  const doc = await one(
    `SELECT d.*, p.client_id AS project_client_id, p.lead_surveyor_id
       FROM property_documents d
       LEFT JOIN survey_projects p ON p.id = d.project_id
      WHERE d.id = ? AND d.deleted_at IS NULL`,
    [id],
  );
  if (!doc) throw notFound('Document not found.');

  let allowed = false;
  if (req.user.role === 'admin') allowed = true;
  else if (req.user.role === 'client') allowed = doc.client_id === req.user.id;
  else if (req.user.role === 'surveyor' && doc.project_id) {
    allowed = await canAccessProject(req.user, doc.project_id);
  }
  if (!allowed) throw forbidden('You are not authorised to access this document.');
  return doc;
}

function streamDocument(req, res, doc, disposition) {
  const filePath = resolveStoredFile('documents', doc.stored_name);
  if (!fs.existsSync(filePath)) throw notFound('The stored file is missing. Contact the office.');
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', contentDisposition(disposition, doc.original_name));
  fs.createReadStream(filePath).pipe(res);
}

router.get(
  '/:id/file',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await loadDocumentForUser(req);
    streamDocument(req, res, doc, 'inline');
  }),
);

router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await loadDocumentForUser(req);
    await audit(req, 'document.download', `Downloaded document #${doc.id}`, {
      entityType: 'document',
      entityId: doc.id,
    });
    streamDocument(req, res, doc, 'attachment');
  }),
);

/* ------------------------------------------------------------------ */
/* Version history                                                    */
/* ------------------------------------------------------------------ */
router.get(
  '/:id/versions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await loadDocumentForUser(req);

    // Walk the supersedes chain in both directions.
    const family = await query(
      `SELECT d.id, d.version, d.status, d.original_name, d.review_notes, d.created_at, u.full_name AS uploaded_by_name
         FROM property_documents d JOIN users u ON u.id = d.uploaded_by
        WHERE d.deleted_at IS NULL
          AND (d.id = ? OR d.supersedes_id = ? OR d.id = ?)
        ORDER BY d.version ASC`,
      [doc.id, doc.id, doc.supersedes_id || 0],
    );

    res.json({
      versions: family.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        fileName: v.original_name,
        reviewNotes: v.review_notes,
        uploadedBy: v.uploaded_by_name,
        createdAt: v.created_at,
        current: v.id === doc.id,
      })),
    });
  }),
);

module.exports = router;
