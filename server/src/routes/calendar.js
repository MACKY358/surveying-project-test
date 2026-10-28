'use strict';

const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db');
const { asyncHandler, badRequest, forbidden, notFound, conflict } = require('../lib/errors');
const { parse, isoDate, optionalText } = require('../lib/validate');
const { requireAuth, requireAdmin, requireStaff, canAccessProject } = require('../middleware/auth');
const { notifyUsers, notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { todayManila, addDays } = require('../lib/slots');

const router = express.Router();

const STATUS_COLORS = {
  pending: 'amber',
  approved: 'blue',
  confirmed: 'green',
  rescheduling_requested: 'violet',
  in_progress: 'teal',
  completed: 'slate',
  rejected: 'red',
  cancelled: 'gray',
  scheduled: 'green',
};

/** Combine date + time into an ISO-ish local datetime string. */
function dt(date, time) {
  return `${date}T${String(time).slice(0, 8)}`;
}

function addMinutesToDate(date, time, minutes) {
  const [h, m] = String(time).split(':').map(Number);
  const total = h * 60 + m + Number(minutes || 60);
  const dayOffset = Math.floor(total / 1440);
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return `${d.toISOString().slice(0, 10)}T${hh}:${mm}:00`;
}

/* ------------------------------------------------------------------ */
/* Calendar feed                                                      */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const from = req.query.from ? parse(isoDate, String(req.query.from)) : addDays(todayManila(), -7);
    const to = req.query.to ? parse(isoDate, String(req.query.to)) : addDays(todayManila(), 60);
    if (to < from) throw badRequest('The end date must be after the start date.');

    const surveyorId = Number(req.query.surveyorId) || null;
    const serviceId = Number(req.query.serviceId) || null;
    const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
    const location = req.query.location ? String(req.query.location).trim() : '';

    const where = ['a.preferred_date BETWEEN ? AND ?'];
    const params = [from, to];

    if (req.user.role === 'client') {
      where.push('a.client_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'surveyor') {
      where.push('a.assigned_surveyor_id = ?');
      params.push(req.user.id);
    } else if (surveyorId) {
      where.push('a.assigned_surveyor_id = ?');
      params.push(surveyorId);
    }
    if (serviceId) {
      where.push('a.service_id = ?');
      params.push(serviceId);
    }
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    if (location) {
      where.push('a.location_summary LIKE ?');
      params.push(`%${location}%`);
    }

    const appointments = await query(
      `SELECT a.id, a.reference_no, a.status, a.preferred_date, a.preferred_time, a.duration_minutes,
              a.location_summary, a.assigned_surveyor_id, a.service_id,
              s.name AS service_name, c.full_name AS client_name, sv.full_name AS surveyor_name,
              p.id AS project_id, p.project_no, p.stage
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN users c ON c.id = a.client_id
         LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
         LEFT JOIN survey_projects p ON p.appointment_id = a.id
        WHERE ${where.join(' AND ')}
        ORDER BY a.preferred_date, a.preferred_time`,
      params,
    );

    const events = appointments.map((a) => ({
      id: `appt-${a.id}`,
      kind: 'appointment',
      title: `${a.service_name}`,
      subtitle: `${a.client_name}${a.project_no ? ` · ${a.project_no}` : ''}`,
      start: dt(a.preferred_date, a.preferred_time),
      end: addMinutesToDate(a.preferred_date, a.preferred_time, a.duration_minutes),
      date: a.preferred_date,
      status: a.status,
      color: STATUS_COLORS[a.status] || 'blue',
      referenceNo: a.reference_no,
      serviceName: a.service_name,
      clientName: a.client_name,
      surveyor: a.assigned_surveyor_id ? { id: a.assigned_surveyor_id, name: a.surveyor_name } : null,
      location: a.location_summary,
      projectId: a.project_id || null,
      projectNo: a.project_no || null,
      appointmentId: a.id,
    }));

    // Manually created schedule entries (those without an appointment) are
    // shown separately so confirmed bookings never appear twice.
    const schWhere = ['sc.appointment_id IS NULL', 'DATE(sc.starts_at) BETWEEN ? AND ?'];
    const schParams = [from, to];
    if (req.user.role === 'surveyor') {
      schWhere.push('sc.staff_id = ?');
      schParams.push(req.user.id);
    } else if (req.user.role === 'client') {
      schWhere.push('p.client_id = ?');
      schParams.push(req.user.id);
    } else if (surveyorId) {
      schWhere.push('sc.staff_id = ?');
      schParams.push(surveyorId);
    }

    const schedules = await query(
      `SELECT sc.*, u.full_name AS staff_name, p.project_no, p.client_id, s.name AS service_name
         FROM surveying_schedules sc
         JOIN survey_projects p ON p.id = sc.project_id
         LEFT JOIN users u ON u.id = sc.staff_id
         JOIN services s ON s.id = p.service_id
        WHERE ${schWhere.join(' AND ')}
        ORDER BY sc.starts_at`,
      schParams,
    );

    for (const s of schedules) {
      events.push({
        id: `sch-${s.id}`,
        kind: 'schedule',
        title: s.title,
        subtitle: `${s.project_no}${s.staff_name ? ` · ${s.staff_name}` : ''}`,
        start: String(s.starts_at).replace(' ', 'T'),
        end: String(s.ends_at).replace(' ', 'T'),
        date: String(s.starts_at).slice(0, 10),
        status: s.status,
        color: s.schedule_type === 'fieldwork' ? 'teal' : 'slate',
        referenceNo: null,
        serviceName: s.service_name,
        clientName: null,
        surveyor: s.staff_id ? { id: s.staff_id, name: s.staff_name } : null,
        location: s.location,
        projectId: s.project_id,
        projectNo: s.project_no,
        appointmentId: null,
        scheduleId: s.id,
        scheduleType: s.schedule_type,
        createdBy: s.created_by,
      });
    }

    events.sort((a, b) => String(a.start).localeCompare(String(b.start)));

    // Detect overlaps per staff member (server-side truth, not client-side).
    const conflicts = [];
    const byStaff = new Map();
    for (const ev of events) {
      if (!ev.surveyor || ['cancelled', 'rejected', 'completed'].includes(ev.status)) continue;
      const key = ev.surveyor.id;
      if (!byStaff.has(key)) byStaff.set(key, []);
      byStaff.get(key).push(ev);
    }
    for (const [staffId, list] of byStaff) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];
          if (a.start < b.end && b.start < a.end) {
            conflicts.push({ staffId, staffName: a.surveyor.name, a: a.id, b: b.id, date: a.date });
          }
        }
      }
    }

    res.json({
      from,
      to,
      events,
      conflicts,
      surveyors:
        req.user.role === 'client'
          ? []
          : await query(
              `SELECT u.id, u.full_name FROM users u
                WHERE u.role = 'surveyor' AND u.is_active = 1 AND u.deleted_at IS NULL ORDER BY u.full_name`,
            ),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Create manual schedule entry (admin)                               */
/* ------------------------------------------------------------------ */
const scheduleSchema = z.object({
  projectId: z.coerce.number().int().positive('Choose a project.'),
  staffId: z.coerce.number().int().positive().optional().nullable(),
  scheduleType: z.enum(['fieldwork', 'office_work', 'review', 'meeting', 'other']).default('fieldwork'),
  title: z.string().trim().min(3, 'Enter a title.').max(160),
  date: isoDate,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.'),
  location: optionalText(255),
  notes: optionalText(2000),
});

router.post(
  '/schedules',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = parse(scheduleSchema, req.body);
    if (data.endTime <= data.startTime) throw badRequest('The end time must be after the start time.');

    const project = await one('SELECT * FROM survey_projects WHERE id = ?', [data.projectId]);
    if (!project) throw notFound('Project not found.');

    if (data.staffId) {
      const clash = await one(
        `SELECT id FROM surveying_schedules
          WHERE staff_id = ? AND status IN ('scheduled','in_progress')
            AND starts_at < ? AND ends_at > ? LIMIT 1`,
        [data.staffId, `${data.date} ${data.endTime}:00`, `${data.date} ${data.startTime}:00`],
      );
      if (clash) throw conflict('That staff member already has an overlapping schedule entry.');
    }

    const result = await query(
      `INSERT INTO surveying_schedules
         (project_id, staff_id, schedule_type, title, starts_at, ends_at, location, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.projectId,
        data.staffId || null,
        data.scheduleType,
        data.title,
        `${data.date} ${data.startTime}:00`,
        `${data.date} ${data.endTime}:00`,
        data.location,
        data.notes,
        req.user.id,
      ],
    );

    if (data.staffId) {
      await notifyUsers(data.staffId, {
        type: 'schedule',
        title: 'New schedule entry',
        message: `${data.title} on ${data.date} ${data.startTime}–${data.endTime}.`,
        link: '/staff/schedule',
      });
    }
    await audit(req, 'schedule.create', `Schedule "${data.title}" created`, {
      entityType: 'schedule',
      entityId: result.insertId,
    });

    res.status(201).json({ ok: true, id: result.insertId, message: 'Schedule entry created.' });
  }),
);

const patchScheduleSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  staffId: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'conflict']).optional(),
  date: isoDate.optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  location: optionalText(255),
  notes: optionalText(2000),
});

router.patch(
  '/schedules/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(patchScheduleSchema, req.body);
    const existing = await one('SELECT * FROM surveying_schedules WHERE id = ?', [id]);
    if (!existing) throw notFound('Schedule entry not found.');

    const date = data.date || String(existing.starts_at).slice(0, 10);
    const startTime = data.startTime || String(existing.starts_at).slice(11, 16);
    const endTime = data.endTime || String(existing.ends_at).slice(11, 16);
    const staffId = data.staffId === undefined ? existing.staff_id : data.staffId;

    if (endTime <= startTime) throw badRequest('The end time must be after the start time.');

    if (staffId) {
      const clash = await one(
        `SELECT id FROM surveying_schedules
          WHERE staff_id = ? AND id <> ? AND status IN ('scheduled','in_progress')
            AND starts_at < ? AND ends_at > ? LIMIT 1`,
        [staffId, id, `${date} ${endTime}:00`, `${date} ${startTime}:00`],
      );
      if (clash) throw conflict('That staff member already has an overlapping schedule entry.');
    }

    await query(
      `UPDATE surveying_schedules
          SET title = COALESCE(?, title), staff_id = ?, status = COALESCE(?, status),
              starts_at = ?, ends_at = ?, location = COALESCE(?, location), notes = COALESCE(?, notes)
        WHERE id = ?`,
      [data.title || null, staffId || null, data.status || null, `${date} ${startTime}:00`, `${date} ${endTime}:00`, data.location, data.notes, id],
    );

    await audit(req, 'schedule.update', `Schedule #${id} updated`, { entityType: 'schedule', entityId: id });
    res.json({ ok: true, message: 'Schedule entry updated.' });
  }),
);

router.delete(
  '/schedules/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM surveying_schedules WHERE id = ?', [id]);
    if (!existing) throw notFound('Schedule entry not found.');
    if (existing.appointment_id) {
      throw badRequest('This entry belongs to a confirmed booking. Cancel or reschedule the appointment instead.');
    }
    await query('DELETE FROM surveying_schedules WHERE id = ?', [id]);
    await audit(req, 'schedule.delete', `Schedule #${id} deleted`, { entityType: 'schedule', entityId: id });
    res.json({ ok: true, message: 'Schedule entry removed.' });
  }),
);

module.exports = router;
