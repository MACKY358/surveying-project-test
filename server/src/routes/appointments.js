'use strict';

const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const { query, one, transaction, tquery } = require('../db');
const { asyncHandler, badRequest, forbidden, notFound, conflict } = require('../lib/errors');
const {
  parse,
  trimmed,
  optionalText,
  isoDate,
  timeOfDay,
  pagination,
  orderBy,
  likeTerm,
} = require('../lib/validate');
const { requireAuth, requireRole, requireStaff } = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');
const { assertNoConflict, dayAvailability, surveyorLoad, todayManila, addDays } = require('../lib/slots');
const { notifyUsers, notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { progressFor, stageLabel } = require('../lib/stages');
const { pageMeta } = require('../lib/format');
const { parseAllowedTypes, humanSize, contentDisposition, resolveStoredFile } = require('../lib/files');
const fs = require('fs');

const router = express.Router();

const MAX_PENDING_PER_CLIENT = 5;

function reference(prefix = 'TRS') {
  const d = todayManila().replace(/-/g, '');
  return `${prefix}-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

const SELECT_APPOINTMENT = `
  SELECT a.*, s.name AS service_name, s.code AS service_code, s.base_fee,
         c.full_name AS client_name, c.email AS client_email, c.phone AS client_phone,
         sv.full_name AS surveyor_name,
         p.lot_no, p.barangay, p.city_municipality, p.province, p.address_line,
         pr.id AS project_id, pr.project_no, pr.stage AS project_stage, pr.progress_percent
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN users c ON c.id = a.client_id
    LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
    LEFT JOIN properties p ON p.id = a.property_id
    LEFT JOIN survey_projects pr ON pr.appointment_id = a.id`;

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    referenceNo: row.reference_no,
    status: row.status,
    client: { id: row.client_id, name: row.client_name, email: row.client_email, phone: row.client_phone },
    service: { id: row.service_id, name: row.service_name, code: row.service_code, baseFee: Number(row.base_fee) },
    surveyor: row.assigned_surveyor_id ? { id: row.assigned_surveyor_id, name: row.surveyor_name } : null,
    property: {
      id: row.property_id,
      lotNo: row.lot_no,
      barangay: row.barangay,
      cityMunicipality: row.city_municipality,
      province: row.province,
      addressLine: row.address_line,
    },
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time,
    durationMinutes: row.duration_minutes,
    locationSummary: row.location_summary,
    clientNotes: row.client_notes,
    adminNotes: row.admin_notes,
    rejectionReason: row.rejection_reason,
    rescheduleRequestedDate: row.reschedule_requested_date,
    rescheduleRequestedTime: row.reschedule_requested_time,
    rescheduleReason: row.reschedule_reason,
    feeEstimate: row.fee_estimate === null ? null : Number(row.fee_estimate),
    project: row.project_id ? { id: row.project_id, projectNo: row.project_no, stage: row.project_stage, stageLabel: stageLabel(row.project_stage), progressPercent: row.progress_percent } : null,
    approvedAt: row.approved_at,
    confirmedAt: row.confirmed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* List                                                               */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, sort, dir } = parse(pagination, req.query);
    const status = req.query.status ? String(req.query.status) : '';
    const from = req.query.from ? String(req.query.from) : '';
    const to = req.query.to ? String(req.query.to) : '';
    const serviceId = Number(req.query.serviceId) || null;
    const surveyorId = Number(req.query.surveyorId) || null;

    const where = ['1 = 1'];
    const params = [];

    if (req.user.role === 'client') {
      where.push('a.client_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'surveyor') {
      where.push('a.assigned_surveyor_id = ?');
      params.push(req.user.id);
    }

    if (status && status !== 'all') {
      const list = status.split(',').filter(Boolean);
      where.push(`a.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (from) {
      where.push('a.preferred_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('a.preferred_date <= ?');
      params.push(to);
    }
    if (serviceId) {
      where.push('a.service_id = ?');
      params.push(serviceId);
    }
    if (surveyorId && req.user.role === 'admin') {
      where.push('a.assigned_surveyor_id = ?');
      params.push(surveyorId);
    }
    if (q) {
      where.push('(a.reference_no LIKE ? OR c.full_name LIKE ? OR a.location_summary LIKE ? OR p.lot_no LIKE ?)');
      const term = likeTerm(q);
      params.push(term, term, term, term);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const order = orderBy(sort, dir, { date: 'a.preferred_date', created: 'a.created_at', status: 'a.status' }, 'a.preferred_date');

    const total = Number(
      (await one(
        `SELECT COUNT(*) AS total FROM appointments a
          JOIN users c ON c.id = a.client_id
          LEFT JOIN properties p ON p.id = a.property_id
          ${whereSql}`,
        params,
      )).total,
    );

    const rows = await query(
      `${SELECT_APPOINTMENT} ${whereSql} ${order === 'ORDER BY a.preferred_date DESC' ? 'ORDER BY a.preferred_date DESC, a.preferred_time DESC' : `${order}, a.preferred_time DESC`} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );

    res.json({ appointments: rows.map(shape), meta: pageMeta({ page, pageSize, total }) });
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
    const row = await one(`${SELECT_APPOINTMENT} WHERE a.id = ?`, [id]);
    if (!row) throw notFound('Appointment not found.');

    if (req.user.role === 'client' && row.client_id !== req.user.id) throw forbidden();
    if (req.user.role === 'surveyor' && row.assigned_surveyor_id !== req.user.id) {
      // A surveyor may still see an unassigned request? No — keep it strict.
      throw forbidden();
    }

    const documents = await query(
      `SELECT d.id, d.title, d.category, d.original_name, d.mime_type, d.size_bytes, d.status,
              d.created_at, d.version, u.full_name AS uploaded_by_name
         FROM property_documents d
         JOIN users u ON u.id = d.uploaded_by
        WHERE d.appointment_id = ? AND d.deleted_at IS NULL
        ORDER BY d.created_at DESC`,
      [id],
    );

    const schedule = await query(
      `SELECT sc.*, u.full_name AS staff_name FROM surveying_schedules sc
         LEFT JOIN users u ON u.id = sc.staff_id
        WHERE sc.appointment_id = ? ORDER BY sc.starts_at`,
      [id],
    );

    res.json({
      appointment: shape(row),
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        originalName: d.original_name,
        mimeType: d.mime_type,
        size: humanSize(d.size_bytes),
        status: d.status,
        version: d.version,
        uploadedBy: d.uploaded_by_name,
        createdAt: d.created_at,
      })),
      schedule: schedule.map((s) => ({
        id: s.id,
        type: s.schedule_type,
        title: s.title,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        location: s.location,
        status: s.status,
        staffName: s.staff_name,
      })),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Create booking (client)                                            */
/* ------------------------------------------------------------------ */
const bookingSchema = z.object({
  serviceId: z.coerce.number().int().positive('Choose a surveying service.'),
  propertyId: z.coerce.number().int().positive().optional().nullable(),
  preferredDate: isoDate,
  preferredTime: timeOfDay,
  clientNotes: optionalText(2000),
  lotNo: optionalText(60),
  blockNo: optionalText(60),
  barangay: optionalText(120),
  cityMunicipality: optionalText(120),
  province: optionalText(120),
  addressLine: optionalText(255),
  areaSqm: z.coerce.number().min(0).max(99999999).optional().nullable(),
  titleNo: optionalText(80),
  taxDeclarationNo: optionalText(80),
  titleHolder: optionalText(180),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  propertyNotes: optionalText(1000),
});

router.post(
  '/',
  requireAuth,
  requireRole('client'),
  uploadDocument.array('documents', 6),
  asyncHandler(async (req, res) => {
    const data = parse(bookingSchema, req.body);

    const service = await one('SELECT * FROM services WHERE id = ? AND is_active = 1', [data.serviceId]);
    if (!service) throw badRequest('That surveying service is unavailable.', { serviceId: 'Choose another service.' });

    const today = todayManila();
    if (data.preferredDate < addDays(today, 1)) {
      throw badRequest('Choose a date at least one day from today.', { preferredDate: 'Date is too soon.' });
    }

    // Slot must be open on the public calendar.
    const day = await dayAvailability(data.preferredDate, service.duration_minutes);
    const slot = day.slots.find((s) => s.time.slice(0, 5) === data.preferredTime.slice(0, 5));
    if (!slot || !slot.available) {
      throw conflict('That time is not available. Please pick another slot.', {
        preferredTime: slot ? slot.reason : 'Outside office hours',
      });
    }

    const pending = Number(
      (await one(`SELECT COUNT(*) AS c FROM appointments WHERE client_id = ? AND status = 'pending'`, [req.user.id])).c,
    );
    if (pending >= MAX_PENDING_PER_CLIENT) {
      throw badRequest('You already have several pending requests. Please wait for the office to review them.');
    }

    const locationSummary = [
      data.addressLine,
      data.barangay ? `Brgy. ${data.barangay}` : null,
      data.cityMunicipality,
      data.province,
    ]
      .filter(Boolean)
      .join(', ');

    const files = req.files || [];

    const result = await transaction(async (conn) => {
      let propertyId = data.propertyId || null;
      if (propertyId) {
        const owned = await tquery(conn, 'SELECT id FROM properties WHERE id = ? AND client_id = ?', [
          propertyId,
          req.user.id,
        ]);
        if (!owned.length) throw badRequest('That property record does not belong to your account.');
      } else if (data.lotNo || data.addressLine || data.barangay) {
        const ins = await conn.execute(
          `INSERT INTO properties (client_id, title_holder, lot_no, block_no, barangay, city_municipality, province,
              address_line, area_sqm, title_no, tax_declaration_no, latitude, longitude, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            data.titleHolder,
            data.lotNo,
            data.blockNo,
            data.barangay,
            data.cityMunicipality,
            data.province,
            data.addressLine,
            data.areaSqm || null,
            data.titleNo,
            data.taxDeclarationNo,
            data.latitude || null,
            data.longitude || null,
            data.propertyNotes,
          ],
        );
        propertyId = ins[0].insertId;
      }

      const ref = reference();
      const ins = await conn.execute(
        `INSERT INTO appointments
           (reference_no, client_id, property_id, service_id, preferred_date, preferred_time, duration_minutes,
            status, location_summary, client_notes, fee_estimate)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [
          ref,
          req.user.id,
          propertyId,
          data.serviceId,
          data.preferredDate,
          data.preferredTime,
          service.duration_minutes,
          locationSummary || null,
          data.clientNotes,
          service.base_fee,
        ],
      );
      const appointmentId = ins[0].insertId;

      for (const file of files) {
        await tquery(
          conn,
          `INSERT INTO property_documents
             (property_id, client_id, appointment_id, category, title, original_name, stored_name, mime_type,
              size_bytes, status, uploaded_by)
           VALUES (?, ?, ?, 'other', ?, ?, ?, ?, ?, 'submitted', ?)`,
          [
            propertyId,
            req.user.id,
            appointmentId,
            'Booking attachment',
            file.originalname,
            file.filename,
            file.mimetype,
            file.size,
            req.user.id,
          ],
        );
      }

      return { appointmentId, ref };
    });

    await notifyAdmins({
      type: 'appointment',
      title: 'New appointment request',
      message: `${req.user.full_name} requested ${service.name} on ${data.preferredDate}. Ref ${result.ref}.`,
      link: '/admin/appointments',
    });
    await audit(req, 'appointment.create', `Booking ${result.ref} created for ${service.name}`, {
      entityType: 'appointment',
      entityId: result.appointmentId,
    });

    const row = await one(`${SELECT_APPOINTMENT} WHERE a.id = ?`, [result.appointmentId]);
    res.status(201).json({
      appointment: shape(row),
      message: `Booking request submitted. Your reference number is ${result.ref}.`,
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Client: request reschedule                                         */
/* ------------------------------------------------------------------ */
const rescheduleSchema = z.object({
  date: isoDate,
  time: timeOfDay,
  reason: trimmed(500, 'Reason'),
});

router.patch(
  '/:id/reschedule',
  requireAuth,
  requireRole('client'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(rescheduleSchema, req.body);
    const appt = await one('SELECT * FROM appointments WHERE id = ? AND client_id = ?', [id, req.user.id]);
    if (!appt) throw notFound('Appointment not found.');

    if (['completed', 'cancelled', 'rejected'].includes(appt.status)) {
      throw badRequest(`A ${appt.status} appointment cannot be rescheduled. Please create a new booking.`);
    }

    await query(
      `UPDATE appointments
          SET status = 'rescheduling_requested', reschedule_requested_date = ?, reschedule_requested_time = ?,
              reschedule_reason = ?
        WHERE id = ?`,
      [data.date, data.time, data.reason, id],
    );

    await notifyAdmins({
      type: 'appointment',
      title: 'Reschedule request',
      message: `${req.user.full_name} requested to move ${appt.reference_no} to ${data.date} ${data.time}.`,
      link: '/admin/appointments',
    });
    await audit(req, 'appointment.reschedule_request', `Reschedule requested for ${appt.reference_no}`, {
      entityType: 'appointment',
      entityId: id,
    });

    res.json({ ok: true, message: 'Reschedule request sent. The office will confirm the new schedule.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Client: cancel                                                     */
/* ------------------------------------------------------------------ */
router.patch(
  '/:id/cancel',
  requireAuth,
  requireRole('client'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const reason = optionalText(500).parse(req.body.reason);
    const appt = await one('SELECT * FROM appointments WHERE id = ? AND client_id = ?', [id, req.user.id]);
    if (!appt) throw notFound('Appointment not found.');
    if (['completed', 'cancelled', 'rejected'].includes(appt.status)) {
      throw badRequest(`This appointment is already ${appt.status}.`);
    }

    await query(
      `UPDATE appointments SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?`,
      [reason, id],
    );
    await query(
      `UPDATE surveying_schedules SET status = 'cancelled' WHERE appointment_id = ? AND status = 'scheduled'`,
      [id],
    );
    await notifyAdmins({
      type: 'appointment',
      title: 'Appointment cancelled by client',
      message: `${req.user.full_name} cancelled ${appt.reference_no}.`,
      link: '/admin/appointments',
    });
    await audit(req, 'appointment.cancel', `Client cancelled ${appt.reference_no}`, {
      entityType: 'appointment',
      entityId: id,
    });
    res.json({ ok: true, message: 'Appointment cancelled.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Admin decision workflow                                            */
/* ------------------------------------------------------------------ */
const decisionSchema = z.object({
  action: z.enum(['approve', 'reject', 'confirm', 'reschedule', 'resolve_reschedule', 'start', 'complete', 'cancel']),
  surveyorId: z.coerce.number().int().positive().optional().nullable(),
  date: isoDate.optional(),
  time: timeOfDay.optional(),
  note: optionalText(500),
  reason: optionalText(500),
});

async function assertSurveyor(surveyorId) {
  const staff = await one(
    `SELECT u.id, sp.max_daily_projects FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.id = ? AND u.role = 'surveyor' AND u.is_active = 1 AND u.deleted_at IS NULL`,
    [surveyorId],
  );
  if (!staff) throw badRequest('Select an active surveyor.', { surveyorId: 'Invalid surveyor.' });
  return staff;
}

async function ensureSchedule(appt, surveyorId, date, time, location) {
  const duration = Number(appt.duration_minutes) || 120;
  const startsAt = `${date} ${time.length === 5 ? `${time}:00` : time}`;
  const [h, m] = time.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endsAt = `${date} ${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`;

  const existing = await one(
    `SELECT id FROM surveying_schedules WHERE appointment_id = ? AND schedule_type = 'fieldwork' ORDER BY id LIMIT 1`,
    [appt.id],
  );
  if (existing) {
    await query(
      `UPDATE surveying_schedules SET staff_id = ?, starts_at = ?, ends_at = ?, location = ?, status = 'scheduled'
        WHERE id = ?`,
      [surveyorId, startsAt, endsAt, location, existing.id],
    );
  } else {
    await query(
      `INSERT INTO surveying_schedules
         (project_id, appointment_id, staff_id, schedule_type, title, starts_at, ends_at, location, created_by)
       VALUES (?, ?, ?, 'fieldwork', ?, ?, ?, ?, ?)`,
      [
        appt.project_id,
        appt.id,
        surveyorId,
        `Field survey — ${appt.reference_no}`,
        startsAt,
        endsAt,
        location,
        appt.actorId,
      ],
    );
  }
}

router.patch(
  '/:id/decision',
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(decisionSchema, req.body);
    const appt = await one(`${SELECT_APPOINTMENT} WHERE a.id = ?`, [id]);
    if (!appt) throw notFound('Appointment not found.');

    if (req.user.role === 'surveyor') {
      if (appt.assigned_surveyor_id !== req.user.id) throw forbidden();
      if (!['start', 'complete'].includes(data.action)) {
        throw forbidden('Surveyors can only start or complete their assigned fieldwork.');
      }
    }

    const clientId = appt.client_id;
    let message = '';
    let title = '';

    if (data.action === 'approve' || data.action === 'confirm') {
      const surveyorId = data.surveyorId || appt.assigned_surveyor_id;
      if (!surveyorId) throw badRequest('Assign a surveyor before approving.', { surveyorId: 'Required.' });
      const staff = await assertSurveyor(surveyorId);

      const date = data.date || appt.preferred_date;
      const time = data.time || appt.preferred_time;
      await assertNoConflict({
        date,
        time,
        duration: appt.duration_minutes,
        surveyorId,
        clientId,
        excludeAppointmentId: id,
      });

      const load = await surveyorLoad(surveyorId, date, id);
      if (staff.max_daily_projects && load >= Number(staff.max_daily_projects)) {
        throw conflict('That surveyor already has the maximum number of bookings for this date.');
      }

      const newStatus = data.action === 'approve' ? 'approved' : 'confirmed';

      await transaction(async (conn) => {
        await tquery(
          conn,
          `UPDATE appointments
              SET status = ?, assigned_surveyor_id = ?, preferred_date = ?, preferred_time = ?,
                  approved_by = COALESCE(approved_by, ?), approved_at = COALESCE(approved_at, NOW()),
                  confirmed_at = CASE WHEN ? = 'confirmed' THEN NOW() ELSE confirmed_at END,
                  rejection_reason = NULL, reschedule_requested_date = NULL, reschedule_requested_time = NULL,
                  reschedule_reason = NULL
            WHERE id = ?`,
          [newStatus, surveyorId, date, time, req.user.id, newStatus, id],
        );

        // Create the project container once approval happens.
        const existing = await tquery(conn, 'SELECT id FROM survey_projects WHERE appointment_id = ?', [id]);
        let projectId;
        if (!existing.length) {
          const projectNo = `PRJ-${date.slice(0, 4)}-${String(id).padStart(4, '0')}`;
          const ins = await conn.execute(
            `INSERT INTO survey_projects
               (project_no, appointment_id, client_id, property_id, service_id, stage, progress_percent,
                lead_surveyor_id, summary, started_at)
             VALUES (?, ?, ?, ?, ?, 'appointment_confirmed', ?, ?, ?, NOW())`,
            [
              projectNo,
              id,
              clientId,
              appt.property_id,
              appt.service_id,
              progressFor('appointment_confirmed'),
              surveyorId,
              appt.client_notes,
            ],
          );
          projectId = ins[0].insertId;
          await tquery(
            conn,
            `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
             VALUES (?, NULL, 'request_submitted', 'Project created from approved booking.', ?)`,
            [projectId, req.user.id],
          );
          await tquery(
            conn,
            `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
             VALUES (?, 'request_submitted', 'appointment_confirmed', 'Appointment approved and surveyor assigned.', ?)`,
            [projectId, req.user.id],
          );
        } else {
          projectId = existing[0].id;
          await tquery(
            conn,
            `UPDATE survey_projects SET lead_surveyor_id = ?, stage = 'appointment_confirmed',
                progress_percent = ? WHERE id = ?`,
            [surveyorId, progressFor('appointment_confirmed'), projectId],
          );
          await tquery(
            conn,
            `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
             VALUES (?, NULL, 'appointment_confirmed', 'Appointment approved / rescheduled.', ?)`,
            [projectId, req.user.id],
          );
        }

        // Assign the surveyor to the project (keep history via unassigned_at).
        const assigned = await tquery(
          conn,
          `SELECT id FROM project_assignments WHERE project_id = ? AND staff_id = ? AND unassigned_at IS NULL`,
          [projectId, surveyorId],
        );
        if (!assigned.length) {
          await tquery(
            conn,
            `UPDATE project_assignments SET unassigned_at = NOW()
              WHERE project_id = ? AND unassigned_at IS NULL AND role_in_project = 'Lead Surveyor'`,
            [projectId],
          );
          await tquery(
            conn,
            `INSERT INTO project_assignments (project_id, staff_id, role_in_project, assigned_by)
             VALUES (?, ?, 'Lead Surveyor', ?)`,
            [projectId, surveyorId, req.user.id],
          );
        }
      });

      const fresh = await one('SELECT * FROM appointments WHERE id = ?', [id]);
      fresh.project_id = (await one('SELECT id FROM survey_projects WHERE appointment_id = ?', [id])).id;
      fresh.actorId = req.user.id;
      await ensureSchedule(fresh, surveyorId, date, time, appt.location_summary);

      title = data.action === 'approve' ? 'Appointment approved' : 'Appointment confirmed';
      message = `${appt.service_name} on ${date} at ${time.slice(0, 5)} has been ${data.action === 'approve' ? 'approved' : 'confirmed'}.`;
      await notifyUsers(clientId, {
        type: 'appointment',
        title,
        message,
        link: `/app/appointments/${id}`,
      });
      await notifyUsers(surveyorId, {
        type: 'schedule',
        title: 'New field assignment',
        message: `${appt.reference_no} — ${appt.service_name} on ${date} at ${time.slice(0, 5)}.`,
        link: '/staff/schedule',
      });
      await audit(req, `appointment.${data.action}`, `${title} for ${appt.reference_no}`, {
        entityType: 'appointment',
        entityId: id,
      });
    } else if (data.action === 'reject') {
      if (!data.reason) throw badRequest('Provide a reason for rejecting the request.', { reason: 'Required.' });
      await query(
        `UPDATE appointments SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
        [data.reason, req.user.id, id],
      );
      await notifyUsers(clientId, {
        type: 'appointment',
        title: 'Appointment request rejected',
        message: `Your request ${appt.reference_no} was not approved. Reason: ${data.reason}`,
        link: `/app/appointments/${id}`,
      });
      await audit(req, 'appointment.reject', `Rejected ${appt.reference_no}: ${data.reason}`, {
        entityType: 'appointment',
        entityId: id,
      });
      message = 'Appointment rejected and the client has been notified.';
    } else if (data.action === 'reschedule' || data.action === 'resolve_reschedule') {
      const date = data.date || appt.reschedule_requested_date;
      const time = data.time || appt.reschedule_requested_time;
      if (!date || !time) throw badRequest('Provide the new date and time.', { date: 'Required.' });

      const surveyorId = data.surveyorId || appt.assigned_surveyor_id;
      if (!surveyorId) throw badRequest('Assign a surveyor before rescheduling.');

      await assertNoConflict({
        date,
        time,
        duration: appt.duration_minutes,
        surveyorId,
        clientId,
        excludeAppointmentId: id,
      });

      await query(
        `UPDATE appointments
            SET status = 'confirmed', assigned_surveyor_id = ?, preferred_date = ?, preferred_time = ?,
                reschedule_requested_date = NULL, reschedule_requested_time = NULL, reschedule_reason = NULL,
                confirmed_at = NOW()
          WHERE id = ?`,
        [surveyorId, date, time, id],
      );
      const proj = await one('SELECT id FROM survey_projects WHERE appointment_id = ?', [id]);
      const fresh = await one('SELECT * FROM appointments WHERE id = ?', [id]);
      fresh.project_id = proj ? proj.id : null;
      fresh.actorId = req.user.id;
      if (proj) await ensureSchedule(fresh, surveyorId, date, time, appt.location_summary);

      await notifyUsers(clientId, {
        type: 'appointment',
        title: 'Appointment rescheduled',
        message: `${appt.reference_no} is now scheduled on ${date} at ${time.slice(0, 5)}.`,
        link: `/app/appointments/${id}`,
      });
      await notifyUsers(surveyorId, {
        type: 'schedule',
        title: 'Schedule updated',
        message: `${appt.reference_no} moved to ${date} at ${time.slice(0, 5)}.`,
        link: '/staff/schedule',
      });
      await audit(req, 'appointment.reschedule', `Rescheduled ${appt.reference_no} to ${date} ${time}`, {
        entityType: 'appointment',
        entityId: id,
      });
      message = 'Appointment rescheduled and both parties notified.';
    } else if (data.action === 'start') {
      await query(`UPDATE appointments SET status = 'in_progress', started_at = NOW() WHERE id = ?`, [id]);
      const proj = await one('SELECT id, stage FROM survey_projects WHERE appointment_id = ?', [id]);
      if (proj) {
        await query(
          `UPDATE survey_projects SET stage = 'field_survey_in_progress', progress_percent = ? WHERE id = ?`,
          [progressFor('field_survey_in_progress'), proj.id],
        );
        await query(
          `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
           VALUES (?, ?, 'field_survey_in_progress', 'Fieldwork started.', ?)`,
          [proj.id, proj.stage, req.user.id],
        );
      }
      await query(
        `UPDATE surveying_schedules SET status = 'in_progress' WHERE appointment_id = ? AND status = 'scheduled'`,
        [id],
      );
      await notifyUsers(clientId, {
        type: 'appointment',
        title: 'Fieldwork started',
        message: `The field team has started the survey for ${appt.reference_no}.`,
        link: `/app/appointments/${id}`,
      });
      await audit(req, 'appointment.start', `Fieldwork started for ${appt.reference_no}`, {
        entityType: 'appointment',
        entityId: id,
      });
      message = 'Fieldwork marked as in progress.';
    } else if (data.action === 'complete') {
      await query(`UPDATE appointments SET status = 'completed', completed_at = NOW() WHERE id = ?`, [id]);
      const proj = await one('SELECT id, stage FROM survey_projects WHERE appointment_id = ?', [id]);
      if (proj) {
        await query(
          `UPDATE survey_projects SET stage = 'data_processing', progress_percent = ? WHERE id = ?`,
          [progressFor('data_processing'), proj.id],
        );
        await query(
          `INSERT INTO project_status_history (project_id, from_stage, to_stage, note, changed_by)
           VALUES (?, ?, 'data_processing', ?, ?)`,
          [proj.id, proj.stage, data.note || 'Fieldwork completed.', req.user.id],
        );
      }
      await query(
        `UPDATE surveying_schedules SET status = 'completed' WHERE appointment_id = ? AND status IN ('scheduled','in_progress')`,
        [id],
      );
      await notifyUsers(clientId, {
        type: 'appointment',
        title: 'Fieldwork completed',
        message: `Fieldwork for ${appt.reference_no} is complete. Data processing has started.`,
        link: `/app/appointments/${id}`,
      });
      await audit(req, 'appointment.complete', `Fieldwork completed for ${appt.reference_no}`, {
        entityType: 'appointment',
        entityId: id,
      });
      message = 'Fieldwork completed. Project moved to data processing.';
    } else if (data.action === 'cancel') {
      const reason = data.reason || 'Cancelled by the office.';
      await query(
        `UPDATE appointments SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?`,
        [reason, id],
      );
      await query(
        `UPDATE surveying_schedules SET status = 'cancelled' WHERE appointment_id = ? AND status IN ('scheduled','in_progress')`,
        [id],
      );
      await notifyUsers(clientId, {
        type: 'appointment',
        title: 'Appointment cancelled',
        message: `${appt.reference_no} was cancelled. Reason: ${reason}`,
        link: `/app/appointments/${id}`,
      });
      if (appt.assigned_surveyor_id) {
        await notifyUsers(appt.assigned_surveyor_id, {
          type: 'schedule',
          title: 'Assignment cancelled',
          message: `${appt.reference_no} was cancelled. Reason: ${reason}`,
          link: '/staff/schedule',
        });
      }
      await audit(req, 'appointment.cancel', `Office cancelled ${appt.reference_no}: ${reason}`, {
        entityType: 'appointment',
        entityId: id,
      });
      message = 'Appointment cancelled.';
    }

    const updated = await one(`${SELECT_APPOINTMENT} WHERE a.id = ?`, [id]);
    res.json({ appointment: shape(updated), message });
  }),
);

/* ------------------------------------------------------------------ */
/* Admin: edit internal notes / fee                                   */
/* ------------------------------------------------------------------ */
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      adminNotes: optionalText(2000),
      feeEstimate: z.coerce.number().min(0).max(99999999).optional().nullable(),
      durationMinutes: z.coerce.number().int().min(30).max(600).optional(),
    });
    const data = parse(schema, req.body);
    const appt = await one('SELECT reference_no FROM appointments WHERE id = ?', [id]);
    if (!appt) throw notFound('Appointment not found.');

    await query(
      `UPDATE appointments SET admin_notes = ?, fee_estimate = COALESCE(?, fee_estimate),
          duration_minutes = COALESCE(?, duration_minutes) WHERE id = ?`,
      [data.adminNotes, data.feeEstimate ?? null, data.durationMinutes ?? null, id],
    );
    await audit(req, 'appointment.update', `Updated appointment ${appt.reference_no}`, {
      entityType: 'appointment',
      entityId: id,
    });
    const updated = await one(`${SELECT_APPOINTMENT} WHERE a.id = ?`, [id]);
    res.json({ appointment: shape(updated), message: 'Appointment updated.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Document checklist for a booking                                   */
/* ------------------------------------------------------------------ */
router.get(
  '/:id/checklist',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const appt = await one('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) throw notFound('Appointment not found.');
    if (req.user.role === 'client' && appt.client_id !== req.user.id) throw forbidden();
    if (req.user.role === 'surveyor' && appt.assigned_surveyor_id !== req.user.id) throw forbidden();

    const reqs = await query(
      `SELECT * FROM document_requirements
        WHERE is_active = 1 AND (service_id = ? OR service_id IS NULL)
        ORDER BY sort_order, id`,
      [appt.service_id],
    );
    const docs = await query(
      `SELECT requirement_id, status, COUNT(*) AS total FROM property_documents
        WHERE client_id = ? AND deleted_at IS NULL AND requirement_id IS NOT NULL
        GROUP BY requirement_id, status`,
      [appt.client_id],
    );

    res.json({
      checklist: reqs.map((r) => {
        const mine = docs.filter((d) => d.requirement_id === r.id);
        const approved = mine.some((d) => d.status === 'approved');
        const pending = mine.some((d) => ['submitted', 'under_review'].includes(d.status));
        const rejected = mine.some((d) => d.status === 'rejected');
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          isRequired: !!r.is_required,
          allowedTypes: parseAllowedTypes(r.allowed_types),
          maxSizeMb: r.max_size_mb,
          status: approved ? 'approved' : rejected ? 'rejected' : pending ? 'submitted' : 'missing',
        };
      }),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Uploaded file preview helper (appointment attachments)             */
/* ------------------------------------------------------------------ */
router.get(
  '/documents/:docId/file',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await one(
      `SELECT d.*, a.client_id AS appt_client, a.assigned_surveyor_id
         FROM property_documents d
         LEFT JOIN appointments a ON a.id = d.appointment_id
        WHERE d.id = ? AND d.deleted_at IS NULL`,
      [Number(req.params.docId)],
    );
    if (!doc) throw notFound('Document not found.');

    const allowed =
      req.user.role === 'admin' ||
      doc.client_id === req.user.id ||
      (req.user.role === 'surveyor' && doc.assigned_surveyor_id === req.user.id);
    if (!allowed) throw forbidden();

    const filePath = resolveStoredFile('documents', doc.stored_name);
    if (!fs.existsSync(filePath)) throw notFound('The stored file is missing.');

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', contentDisposition(req.query.download === '1' ? 'attachment' : 'inline', doc.original_name));
    fs.createReadStream(filePath).pipe(res);
  }),
);

module.exports = router;
