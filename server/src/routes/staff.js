'use strict';

const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db');
const { asyncHandler, badRequest, notFound } = require('../lib/errors');
const { parse, isoDate, optionalText } = require('../lib/validate');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { todayManila, addDays } = require('../lib/slots');
const { stageLabel } = require('../lib/stages');

const router = express.Router();
router.use(requireAuth, requireStaff);

/* ------------------------------------------------------------------ */
/* Personal schedule                                                  */
/* ------------------------------------------------------------------ */
router.get(
  '/schedule',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? parse(isoDate, String(req.query.from)) : todayManila();
    const to = req.query.to ? parse(isoDate, String(req.query.to)) : addDays(from, 13);
    const staffId = req.user.role === 'admin' && req.query.staffId ? Number(req.query.staffId) : req.user.id;

    const appointments = await query(
      `SELECT a.id, a.reference_no, a.status, a.preferred_date, a.preferred_time, a.duration_minutes,
              a.location_summary, a.client_notes, s.name AS service_name, c.full_name AS client_name,
              c.phone AS client_phone,
              pr.lot_no, pr.block_no, pr.barangay, pr.city_municipality, pr.province, pr.address_line,
              pr.area_sqm, pr.title_no, pr.tax_declaration_no,
              p.id AS project_id, p.project_no, p.stage
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN users c ON c.id = a.client_id
         LEFT JOIN properties pr ON pr.id = a.property_id
         LEFT JOIN survey_projects p ON p.appointment_id = a.id
        WHERE a.assigned_surveyor_id = ? AND a.preferred_date BETWEEN ? AND ?
          AND a.status NOT IN ('cancelled','rejected')
        ORDER BY a.preferred_date, a.preferred_time`,
      [staffId, from, to],
    );

    const manual = await query(
      `SELECT sc.*, p.project_no, s.name AS service_name
         FROM surveying_schedules sc
         JOIN survey_projects p ON p.id = sc.project_id
         JOIN services s ON s.id = p.service_id
        WHERE sc.staff_id = ? AND DATE(sc.starts_at) BETWEEN ? AND ?
        ORDER BY sc.starts_at`,
      [staffId, from, to],
    );

    res.json({
      from,
      to,
      appointments: appointments.map((a) => ({
        id: a.id,
        referenceNo: a.reference_no,
        status: a.status,
        date: a.preferred_date,
        time: a.preferred_time,
        durationMinutes: a.duration_minutes,
        location: a.location_summary,
        clientNotes: a.client_notes,
        serviceName: a.service_name,
        client: { name: a.client_name, phone: a.client_phone },
        property: {
          lotNo: a.lot_no,
          blockNo: a.block_no,
          barangay: a.barangay,
          cityMunicipality: a.city_municipality,
          province: a.province,
          addressLine: a.address_line,
          areaSqm: a.area_sqm === null ? null : Number(a.area_sqm),
          titleNo: a.title_no,
          taxDeclarationNo: a.tax_declaration_no,
        },
        project: a.project_id ? { id: a.project_id, projectNo: a.project_no, stage: a.stage, stageLabel: stageLabel(a.stage) } : null,
      })),
      schedules: manual.map((s) => ({
        id: s.id,
        type: s.schedule_type,
        title: s.title,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        location: s.location,
        status: s.status,
        notes: s.notes,
        projectNo: s.project_no,
        serviceName: s.service_name,
      })),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Report a schedule conflict to the admin                            */
/* ------------------------------------------------------------------ */
const conflictSchema = z.object({
  appointmentId: z.coerce.number().int().positive().optional().nullable(),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  message: z.string().trim().min(10, 'Describe the conflict in a little more detail.').max(2000),
});

router.post(
  '/conflicts',
  asyncHandler(async (req, res) => {
    const data = parse(conflictSchema, req.body);

    let projectId = data.projectId || null;
    if (data.appointmentId) {
      const appt = await one(
        `SELECT a.id, a.reference_no, p.id AS project_id FROM appointments a
           LEFT JOIN survey_projects p ON p.appointment_id = a.id
          WHERE a.id = ? AND a.assigned_surveyor_id = ?`,
        [data.appointmentId, req.user.id],
      );
      if (!appt) throw notFound('Assigned appointment not found.');
      projectId = appt.project_id || projectId;
    }

    if (projectId) {
      await query(
        `INSERT INTO field_notes (project_id, author_id, note_type, body, recorded_on)
         VALUES (?, ?, 'issue', ?, CURDATE())`,
        [projectId, req.user.id, `Schedule conflict reported: ${data.message}`],
      );
    }

    await notifyAdmins({
      type: 'schedule',
      title: 'Schedule conflict reported',
      message: `${req.user.full_name}: ${data.message.slice(0, 200)}`,
      link: '/admin/calendar',
    });
    await audit(req, 'schedule.conflict', `Conflict reported by ${req.user.full_name}`, {
      entityType: projectId ? 'project' : 'schedule',
      entityId: projectId,
    });

    res.status(201).json({ ok: true, message: 'Reported to the office. An administrator will review the schedule.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Quick stats for the staff shell                                    */
/* ------------------------------------------------------------------ */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const today = todayManila();
    const row = await one(
      `SELECT
        (SELECT COUNT(*) FROM appointments WHERE assigned_surveyor_id = ? AND preferred_date = ?
           AND status IN ('approved','confirmed','in_progress')) AS today,
        (SELECT COUNT(*) FROM appointments WHERE assigned_surveyor_id = ? AND preferred_date BETWEEN ? AND ?
           AND status IN ('approved','confirmed','in_progress')) AS week,
        (SELECT COUNT(*) FROM appointments WHERE assigned_surveyor_id = ? AND status = 'in_progress') AS inProgress,
        (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0) AS unread`,
      [req.user.id, today, req.user.id, today, addDays(today, 6), req.user.id, req.user.id],
    );
    res.json({
      today: Number(row.today),
      week: Number(row.week),
      inProgress: Number(row.inProgress),
      unread: Number(row.unread),
    });
  }),
);

module.exports = router;
