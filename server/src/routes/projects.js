'use strict';

const express = require('express');
const { z } = require('zod');
const { query, one, transaction, tquery } = require('../db');
const { asyncHandler, badRequest, forbidden, notFound } = require('../lib/errors');
const { parse, pagination, optionalText, isoDate, likeTerm, orderBy } = require('../lib/validate');
const { requireAuth, requireStaff, requireAdmin, canAccessProject } = require('../middleware/auth');
const { STAGES, MANUAL_STAGES, getStage, progressFor, stageLabel, stageOrder, isStage } = require('../lib/stages');
const { notifyUsers, notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { pageMeta } = require('../lib/format');
const { humanSize } = require('../lib/files');

const router = express.Router();

const PROJECT_COLUMNS = `
  p.id, p.project_no, p.stage, p.progress_percent, p.target_completion_date, p.summary,
  p.started_at, p.completed_at, p.archived_at, p.created_at, p.updated_at,
  p.client_id, p.service_id, p.property_id,
  s.name AS service_name, s.code AS service_code, s.base_fee,
  c.full_name AS client_name, c.email AS client_email, c.phone AS client_phone,
  sv.full_name AS lead_surveyor_name,
  a.reference_no, a.status AS appointment_status, a.preferred_date, a.preferred_time, a.location_summary,
  pr.lot_no, pr.barangay, pr.city_municipality, pr.province, pr.address_line,
  (SELECT COUNT(*) FROM property_documents d WHERE d.project_id = p.id AND d.deleted_at IS NULL) AS document_count,
  (SELECT COUNT(*) FROM blueprints b WHERE b.project_id = p.id) AS blueprint_count,
  (SELECT COUNT(*) FROM property_documents d WHERE d.project_id = p.id AND d.status = 'rejected' AND d.deleted_at IS NULL) AS rejected_documents
`;

const PROJECT_JOIN = `
  FROM survey_projects p
  JOIN services s ON s.id = p.service_id
  JOIN users c ON c.id = p.client_id
  LEFT JOIN users sv ON sv.id = p.lead_surveyor_id
  JOIN appointments a ON a.id = p.appointment_id
  LEFT JOIN properties pr ON pr.id = p.property_id
`;

function shapeProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectNo: row.project_no,
    stage: row.stage,
    stageLabel: stageLabel(row.stage),
    stageOrder: stageOrder(row.stage),
    progressPercent: row.progress_percent,
    targetCompletionDate: row.target_completion_date,
    summary: row.summary,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientId: row.client_id,
    client: { id: row.client_id, name: row.client_name, email: row.client_email, phone: row.client_phone },
    service: { id: row.service_id, name: row.service_name, code: row.service_code, baseFee: Number(row.base_fee) },
    appointment: {
      referenceNo: row.reference_no,
      status: row.appointment_status,
      date: row.preferred_date,
      time: row.preferred_time,
      location: row.location_summary,
    },
    property: {
      id: row.property_id,
      lotNo: row.lot_no,
      barangay: row.barangay,
      cityMunicipality: row.city_municipality,
      province: row.province,
      addressLine: row.address_line,
    },
    leadSurveyor: row.lead_surveyor_name ? { name: row.lead_surveyor_name } : null,
    counts: {
      documents: Number(row.document_count || 0),
      blueprints: Number(row.blueprint_count || 0),
      rejectedDocuments: Number(row.rejected_documents || 0),
    },
  };
}

function scopeFor(user) {
  if (user.role === 'client') return { sql: 'p.client_id = ?', params: [user.id] };
  if (user.role === 'surveyor') {
    return {
      sql: `(p.lead_surveyor_id = ? OR EXISTS (SELECT 1 FROM project_assignments pa
               WHERE pa.project_id = p.id AND pa.staff_id = ? AND pa.unassigned_at IS NULL))`,
      params: [user.id, user.id],
    };
  }
  return { sql: '1 = 1', params: [] };
}

/* ------------------------------------------------------------------ */
/* List                                                               */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, sort, dir } = parse(pagination, req.query);
    const stage = req.query.stage ? String(req.query.stage) : '';
    const archived = req.query.archived === '1';
    const serviceId = Number(req.query.serviceId) || null;

    const scope = scopeFor(req.user);
    const where = [scope.sql, archived ? 'p.archived_at IS NOT NULL' : 'p.archived_at IS NULL'];
    const params = [...scope.params];

    if (stage && stage !== 'all') {
      const list = stage.split(',').filter((s) => isStage(s));
      if (list.length) {
        where.push(`p.stage IN (${list.map(() => '?').join(',')})`);
        params.push(...list);
      }
    }
    if (serviceId) {
      where.push('p.service_id = ?');
      params.push(serviceId);
    }
    if (q) {
      const term = likeTerm(q);
      where.push('(p.project_no LIKE ? OR c.full_name LIKE ? OR pr.lot_no LIKE ? OR a.reference_no LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number(
      (await one(
        `SELECT COUNT(*) AS total ${PROJECT_JOIN} ${whereSql}`,
        params,
      )).total,
    );

    const order = orderBy(sort, dir, { updated: 'p.updated_at', created: 'p.created_at', stage: 'p.progress_percent' }, 'p.updated_at');
    const rows = await query(
      `SELECT ${PROJECT_COLUMNS} ${PROJECT_JOIN} ${whereSql} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );

    res.json({
      projects: rows.map(shapeProject),
      stages: STAGES.map((s) => ({ key: s.key, label: s.label, progress: s.progress })),
      meta: pageMeta({ page, pageSize, total }),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Detail                                                             */
/* ------------------------------------------------------------------ */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await canAccessProject(req.user, id))) throw forbidden();

    const row = await one(`SELECT ${PROJECT_COLUMNS} ${PROJECT_JOIN} WHERE p.id = ?`, [id]);
    if (!row) throw notFound('Project not found.');

    const property = await one('SELECT * FROM properties WHERE id = ?', [row.property_id]);
    const assignments = await query(
      `SELECT pa.id, pa.role_in_project, pa.assigned_at, u.id AS staff_id, u.full_name, u.email, u.phone,
              sp.position, sp.license_no
         FROM project_assignments pa
         JOIN users u ON u.id = pa.staff_id
         LEFT JOIN staff_profiles sp ON sp.user_id = u.id
        WHERE pa.project_id = ? AND pa.unassigned_at IS NULL
        ORDER BY pa.assigned_at`,
      [id],
    );

    const history = await query(
      `SELECT h.*, u.full_name AS changed_by_name FROM project_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.project_id = ? ORDER BY h.created_at DESC, h.id DESC`,
      [id],
    ).catch(async () => {
      // table may not exist on older installs
      return [];
    });

    const schedules = await query(
      `SELECT sc.*, u.full_name AS staff_name FROM surveying_schedules sc
         LEFT JOIN users u ON u.id = sc.staff_id
        WHERE sc.project_id = ? ORDER BY sc.starts_at`,
      [id],
    );

    const docWhere = req.user.role === 'client' ? 'AND d.deleted_at IS NULL' : 'AND d.deleted_at IS NULL';
    const documents = await query(
      `SELECT d.id, d.title, d.category, d.original_name, d.mime_type, d.size_bytes, d.status, d.version,
              d.created_at, d.review_notes, d.reviewed_at, up.full_name AS uploaded_by_name,
              rv.full_name AS reviewed_by_name, dr.name AS requirement_name
         FROM property_documents d
         JOIN users up ON up.id = d.uploaded_by
         LEFT JOIN users rv ON rv.id = d.reviewed_by
         LEFT JOIN document_requirements dr ON dr.id = d.requirement_id
        WHERE d.project_id = ? ${docWhere}
        ORDER BY d.created_at DESC`,
      [id],
    );

    const blueprintRows = await query(
      `SELECT b.id, b.title, b.lot_no, b.status, b.current_version, b.updated_at,
              (SELECT COUNT(*) FROM blueprint_versions v WHERE v.blueprint_id = b.id) AS version_count
         FROM blueprints b WHERE b.project_id = ? ORDER BY b.updated_at DESC`,
      [id],
    );

    const fieldNotes =
      req.user.role === 'client'
        ? []
        : await query(
            `SELECT fn.*, u.full_name AS author_name FROM field_notes fn
               JOIN users u ON u.id = fn.author_id
              WHERE fn.project_id = ? ORDER BY fn.created_at DESC`,
            [id],
          );

    const team =
      req.user.role === 'admin'
        ? await query(
            `SELECT u.id, u.full_name, sp.position, sp.max_daily_projects,
                    (SELECT COUNT(*) FROM appointments a2 WHERE a2.assigned_surveyor_id = u.id
                       AND a2.preferred_date = CURDATE() AND a2.status IN ('approved','confirmed','in_progress')) AS today_load
               FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id
              WHERE u.role = 'surveyor' AND u.is_active = 1 AND u.deleted_at IS NULL
              ORDER BY u.full_name`,
          )
        : [];

    res.json({
      project: shapeProject(row),
      property,
      assignments: assignments.map((a) => ({
        id: a.id,
        staffId: a.staff_id,
        name: a.full_name,
        email: a.email,
        phone: a.phone,
        position: a.position,
        licenseNo: a.license_no,
        role: a.role_in_project,
        assignedAt: a.assigned_at,
      })),
      history: history.map((h) => ({
        id: h.id,
        fromStage: h.from_stage,
        fromLabel: h.from_stage ? stageLabel(h.from_stage) : null,
        toStage: h.to_stage,
        toLabel: stageLabel(h.to_stage),
        note: h.note,
        changedBy: h.changed_by_name,
        createdAt: h.created_at,
      })),
      schedules: schedules.map((s) => ({
        id: s.id,
        type: s.schedule_type,
        title: s.title,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        location: s.location,
        status: s.status,
        staffName: s.staff_name,
        notes: s.notes,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        requirementName: d.requirement_name,
        originalName: d.original_name,
        mimeType: d.mime_type,
        size: humanSize(d.size_bytes),
        sizeBytes: Number(d.size_bytes),
        status: d.status,
        version: d.version,
        uploadedBy: d.uploaded_by_name,
        reviewedBy: d.reviewed_by_name,
        reviewNotes: d.review_notes,
        reviewedAt: d.reviewed_at,
        createdAt: d.created_at,
      })),
      blueprints: blueprintRows.map((b) => ({
        id: b.id,
        title: b.title,
        lotNo: b.lot_no,
        status: b.status,
        currentVersion: b.current_version,
        versionCount: Number(b.version_count),
        updatedAt: b.updated_at,
      })),
      fieldNotes: fieldNotes.map((n) => ({
        id: n.id,
        type: n.note_type,
        body: n.body,
        measurement: n.measurement,
        recordedOn: n.recorded_on,
        author: n.author_name,
        createdAt: n.created_at,
      })),
      team,
      stages: MANUAL_STAGES.map((s) => ({ key: s.key, label: s.label, progress: s.progress })),
      permissions: {
        canManage: req.user.role === 'admin',
        canUpdateProgress: req.user.role === 'admin' || req.user.role === 'surveyor',
        canAddFieldNotes: req.user.role === 'admin' || req.user.role === 'surveyor',
        canUploadBlueprint: req.user.role === 'admin' || req.user.role === 'surveyor',
      },
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Progress update                                                    */
/* ------------------------------------------------------------------ */
const stageSchema = z.object({
  stage: z.string().refine(isStage, 'Choose a valid project stage.'),
  note: optionalText(500),
  targetCompletionDate: isoDate.optional().nullable(),
});

router.patch(
  '/:id/stage',
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(stageSchema, req.body);
    if (!(await canAccessProject(req.user, id))) throw forbidden();

    const project = await one('SELECT * FROM survey_projects WHERE id = ?', [id]);
    if (!project) throw notFound('Project not found.');
    if (project.archived_at) throw badRequest('Archived projects cannot be changed.');
    if (data.stage === 'archived') throw badRequest('Use the archive action to archive a project.');

    if (req.user.role === 'surveyor') {
      const allowed = [
        'initial_review',
        'documents_incomplete',
        'documents_under_review',
        'field_survey_scheduled',
        'field_survey_in_progress',
        'data_processing',
        'professional_review',
        'documents_ready',
      ];
      if (!allowed.includes(data.stage)) {
        throw forbidden('Surveyors cannot move a project to that stage. Ask an administrator.');
      }
      if (stageOrder(data.stage) < stageOrder(project.stage) && data.stage !== 'documents_incomplete') {
        throw forbidden('You cannot move a project backwards. Ask an administrator to correct the stage.');
      }
    }

    await transaction(async (conn) => {
      await tquery(
        conn,
        `UPDATE survey_projects SET stage = ?, progress_percent = ?,
            target_completion_date = COALESCE(?, target_completion_date),
            completed_at = CASE WHEN ? IN ('completed','archived') THEN NOW() ELSE completed_at END
          WHERE id = ?`,
        [data.stage, progressFor(data.stage), data.targetCompletionDate || null, data.stage, id],
      );
      await tquery(
        conn,
        `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
         VALUES (?, ?, ?, ?, ?)`,
        [id, project.stage, data.stage, data.note, req.user.id],
      );
    });

    await notifyUsers(project.client_id, {
      type: 'project',
      title: 'Project progress updated',
      message: `${project.project_no} is now at "${stageLabel(data.stage)}".`,
      link: `/app/projects/${id}`,
    });
    if (req.user.role === 'surveyor') {
      await notifyAdmins({
        type: 'project',
        title: 'Project stage updated',
        message: `${project.project_no} moved to "${stageLabel(data.stage)}" by ${req.user.full_name}.`,
        link: `/admin/projects/${id}`,
      });
    }
    await audit(req, 'project.stage', `${project.project_no}: ${project.stage} → ${data.stage}`, {
      entityType: 'project',
      entityId: id,
    });

    res.json({ ok: true, message: 'Project progress updated and the client was notified.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Admin: project settings                                            */
/* ------------------------------------------------------------------ */
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      targetCompletionDate: isoDate.optional().nullable(),
      summary: optionalText(2000),
      leadSurveyorId: z.coerce.number().int().positive().optional().nullable(),
    });
    const data = parse(schema, req.body);
    const project = await one('SELECT * FROM survey_projects WHERE id = ?', [id]);
    if (!project) throw notFound('Project not found.');

    await query(
      `UPDATE survey_projects
          SET target_completion_date = COALESCE(?, target_completion_date),
              summary = COALESCE(?, summary),
              lead_surveyor_id = COALESCE(?, lead_surveyor_id)
        WHERE id = ?`,
      [data.targetCompletionDate || null, data.summary, data.leadSurveyorId || null, id],
    );
    await audit(req, 'project.update', `Updated project settings for ${project.project_no}`, {
      entityType: 'project',
      entityId: id,
    });
    res.json({ ok: true, message: 'Project updated.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Admin: assign / unassign staff                                     */
/* ------------------------------------------------------------------ */
router.post(
  '/:id/assignments',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      staffId: z.coerce.number().int().positive('Select a staff member.'),
      role: optionalText(80),
    });
    const data = parse(schema, req.body);
    const project = await one('SELECT * FROM survey_projects WHERE id = ?', [id]);
    if (!project) throw notFound('Project not found.');

    const staff = await one(`SELECT id, full_name FROM users WHERE id = ? AND role = 'surveyor' AND is_active = 1`, [
      data.staffId,
    ]);
    if (!staff) throw badRequest('Select an active surveyor.');

    const existing = await one(
      'SELECT id FROM project_assignments WHERE project_id = ? AND staff_id = ? AND unassigned_at IS NULL',
      [id, data.staffId],
    );
    if (existing) throw badRequest(`${staff.full_name} is already assigned to this project.`);

    await query(
      `INSERT INTO project_assignments (project_id, staff_id, role_in_project, assigned_by) VALUES (?, ?, ?, ?)`,
      [id, data.staffId, data.role || 'Field Surveyor', req.user.id],
    );
    await notifyUsers(data.staffId, {
      type: 'project',
      title: 'Assigned to a project',
      message: `You were added to ${project.project_no}.`,
      link: `/staff/projects/${id}`,
    });
    await audit(req, 'project.assign', `Assigned ${staff.full_name} to ${project.project_no}`, {
      entityType: 'project',
      entityId: id,
    });
    res.status(201).json({ ok: true, message: `${staff.full_name} assigned.` });
  }),
);

router.delete(
  '/:id/assignments/:assignmentId',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const assignmentId = Number(req.params.assignmentId);
    const row = await one('SELECT * FROM project_assignments WHERE id = ? AND project_id = ?', [assignmentId, id]);
    if (!row) throw notFound('Assignment not found.');
    await query('UPDATE project_assignments SET unassigned_at = NOW() WHERE id = ?', [assignmentId]);
    await audit(req, 'project.unassign', `Removed assignment #${assignmentId} from project ${id}`, {
      entityType: 'project',
      entityId: id,
    });
    res.json({ ok: true, message: 'Staff member removed from the project.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Field notes (staff + admin)                                        */
/* ------------------------------------------------------------------ */
const noteSchema = z.object({
  type: z.enum(['note', 'measurement', 'issue', 'follow_up', 'completion']).default('note'),
  body: z.string().trim().min(3, 'Enter at least a few words.').max(4000),
  measurement: optionalText(160),
  recordedOn: isoDate.optional().nullable(),
});

router.post(
  '/:id/notes',
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(noteSchema, req.body);
    if (!(await canAccessProject(req.user, id))) throw forbidden();

    const project = await one('SELECT project_no, client_id FROM survey_projects WHERE id = ?', [id]);
    if (!project) throw notFound('Project not found.');

    await query(
      `INSERT INTO field_notes (project_id, author_id, note_type, measurement, body, recorded_on)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, data.type, data.measurement, data.body, data.recordedOn || null],
    );

    if (data.type === 'issue' || data.type === 'follow_up') {
      await notifyAdmins({
        type: 'fieldwork',
        title: data.type === 'issue' ? 'Fieldwork issue reported' : 'Follow-up needed',
        message: `${req.user.full_name} on ${project.project_no}: ${data.body.slice(0, 160)}`,
        link: `/admin/projects/${id}`,
      });
    }
    await audit(req, 'project.field_note', `Added ${data.type} note to ${project.project_no}`, {
      entityType: 'project',
      entityId: id,
    });
    res.status(201).json({ ok: true, message: 'Field note saved.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Archive / restore                                                  */
/* ------------------------------------------------------------------ */
router.post(
  '/:id/archive',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const project = await one('SELECT * FROM survey_projects WHERE id = ?', [id]);
    if (!project) throw notFound('Project not found.');
    if (project.stage !== 'completed') {
      throw badRequest('Only completed projects can be archived. Mark the project completed first.');
    }
    await query(`UPDATE survey_projects SET archived_at = NOW(), stage = 'archived' WHERE id = ?`, [id]);
    await query(
      `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
       VALUES (?, ?, 'archived', 'Project archived.', ?)`,
      [id, project.stage, req.user.id],
    );
    await audit(req, 'project.archive', `Archived ${project.project_no}`, { entityType: 'project', entityId: id });
    res.json({ ok: true, message: 'Project archived.' });
  }),
);

router.post(
  '/:id/restore',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const project = await one('SELECT * FROM survey_projects WHERE id = ?', [id]);
    if (!project) throw notFound('Project not found.');
    if (!project.archived_at) throw badRequest('This project is not archived.');
    await query(`UPDATE survey_projects SET archived_at = NULL, stage = 'completed' WHERE id = ?`, [id]);
    await query(
      `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
       VALUES (?, 'archived', 'completed', 'Project restored from archive.', ?)`,
      [id, req.user.id],
    );
    await audit(req, 'project.restore', `Restored ${project.project_no}`, { entityType: 'project', entityId: id });
    res.json({ ok: true, message: 'Project restored.' });
  }),
);

module.exports = router;
module.exports.shapeProject = shapeProject;
