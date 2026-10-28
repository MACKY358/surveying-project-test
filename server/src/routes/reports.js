'use strict';

const express = require('express');
const { query, one } = require('../db');
const { asyncHandler, badRequest } = require('../lib/errors');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { todayManila, addDays } = require('../lib/slots');
const { stageLabel } = require('../lib/stages');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth, requireAdmin);

function range(req) {
  const to = req.query.to ? String(req.query.to) : todayManila();
  const from = req.query.from ? String(req.query.from) : addDays(to, -29);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw badRequest('Provide valid YYYY-MM-DD dates.');
  }
  if (from > to) throw badRequest('The start date must be on or before the end date.');
  return { from, to };
}

/* ------------------------------------------------------------------ */
/* Aggregate report data                                              */
/* ------------------------------------------------------------------ */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const today = todayManila();

    const summary = await one(
      `SELECT
         (SELECT COUNT(*) FROM appointments WHERE preferred_date BETWEEN ? AND ?) AS appointments,
         (SELECT COUNT(*) FROM appointments WHERE preferred_date BETWEEN ? AND ? AND status = 'completed') AS completed,
         (SELECT COUNT(*) FROM appointments WHERE preferred_date BETWEEN ? AND ? AND status IN ('pending','rescheduling_requested')) AS pending,
         (SELECT COUNT(*) FROM appointments WHERE preferred_date BETWEEN ? AND ? AND status = 'cancelled') AS cancelled,
         (SELECT COUNT(*) FROM users WHERE role = 'client' AND DATE(created_at) BETWEEN ? AND ?) AS new_clients,
         (SELECT COUNT(*) FROM survey_projects WHERE archived_at IS NULL AND stage NOT IN ('completed','archived')) AS active_projects,
         (SELECT COUNT(*) FROM survey_projects WHERE stage = 'completed') AS completed_projects,
         (SELECT COUNT(*) FROM property_documents WHERE DATE(created_at) BETWEEN ? AND ? AND deleted_at IS NULL) AS documents_uploaded,
         (SELECT COUNT(*) FROM property_documents WHERE status = 'rejected' AND deleted_at IS NULL) AS documents_rejected,
         (SELECT COUNT(*) FROM property_documents WHERE status = 'submitted' AND deleted_at IS NULL) AS documents_pending,
         (SELECT COALESCE(SUM(fee_estimate), 0) FROM appointments WHERE preferred_date BETWEEN ? AND ? AND status NOT IN ('rejected','cancelled')) AS estimated_value,
         (SELECT COALESCE(SUM(fee_estimate), 0) FROM appointments WHERE preferred_date BETWEEN ? AND ? AND status = 'completed') AS completed_value`,
      [from, to, from, to, from, to, from, to, from, to, from, to, from, to, from, to],
    );

    const byStatus = await query(
      `SELECT status, COUNT(*) AS total FROM appointments
        WHERE preferred_date BETWEEN ? AND ? GROUP BY status ORDER BY total DESC`,
      [from, to],
    );

    const byService = await query(
      `SELECT s.id, s.name, s.base_fee, COUNT(a.id) AS total,
              SUM(a.status = 'completed') AS completed,
              COALESCE(SUM(CASE WHEN a.status NOT IN ('rejected','cancelled') THEN a.fee_estimate ELSE 0 END), 0) AS value
         FROM services s LEFT JOIN appointments a ON a.service_id = s.id AND a.preferred_date BETWEEN ? AND ?
        GROUP BY s.id, s.name, s.base_fee ORDER BY total DESC`,
      [from, to],
    );

    const byMonth = await query(
      `SELECT DATE_FORMAT(preferred_date, '%Y-%m') AS ym, COUNT(*) AS total,
              SUM(status = 'completed') AS completed, SUM(status = 'cancelled') AS cancelled
         FROM appointments WHERE preferred_date BETWEEN ? AND ?
        GROUP BY ym ORDER BY ym`,
      [from, to],
    );

    const byWeekday = await query(
      `SELECT DAYOFWEEK(preferred_date) AS dow, COUNT(*) AS total
         FROM appointments WHERE preferred_date BETWEEN ? AND ?
        GROUP BY dow ORDER BY dow`,
      [from, to],
    );

    const workload = await query(
      `SELECT u.id, u.full_name, sp.position, sp.max_daily_projects,
              (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
                 AND a.preferred_date BETWEEN ? AND ? AND a.status NOT IN ('rejected','cancelled')) AS total,
              (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
                 AND a.preferred_date BETWEEN ? AND ? AND a.status = 'completed') AS completed,
              (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
                 AND a.status IN ('approved','confirmed','in_progress')) AS active,
              (SELECT COUNT(*) FROM survey_projects p WHERE p.lead_surveyor_id = u.id AND p.archived_at IS NULL) AS lead_projects
         FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id
        WHERE u.role = 'surveyor' AND u.deleted_at IS NULL
        ORDER BY total DESC`,
      [from, to, from, to],
    );

    const documents = await query(
      `SELECT status, COUNT(*) AS total FROM property_documents
        WHERE deleted_at IS NULL GROUP BY status ORDER BY total DESC`,
    );

    const overdue = await query(
      `SELECT p.id, p.project_no, p.stage, p.target_completion_date, s.name AS service_name,
              u.full_name AS client_name, DATEDIFF(?, p.target_completion_date) AS days_overdue
         FROM survey_projects p
         JOIN services s ON s.id = p.service_id
         JOIN users u ON u.id = p.client_id
        WHERE p.archived_at IS NULL AND p.stage <> 'completed'
          AND p.target_completion_date IS NOT NULL AND p.target_completion_date < ?
        ORDER BY days_overdue DESC LIMIT 50`,
      [today, today],
    );

    const clients = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.created_at, cp.city_municipality, cp.province,
              (SELECT COUNT(*) FROM appointments a WHERE a.client_id = u.id) AS appointments,
              (SELECT COUNT(*) FROM survey_projects p WHERE p.client_id = u.id) AS projects
         FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
        WHERE u.role = 'client' AND u.deleted_at IS NULL AND DATE(u.created_at) BETWEEN ? AND ?
        ORDER BY u.created_at DESC`,
      [from, to],
    );

    const appointments = await query(
      `SELECT a.id, a.reference_no, a.preferred_date, a.preferred_time, a.status, a.fee_estimate,
              s.name AS service_name, c.full_name AS client_name, sv.full_name AS surveyor_name,
              a.location_summary
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN users c ON c.id = a.client_id
         LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
        WHERE a.preferred_date BETWEEN ? AND ?
        ORDER BY a.preferred_date DESC, a.preferred_time DESC`,
      [from, to],
    );

    const weekdayNames = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    res.json({
      range: { from, to },
      summary: {
        appointments: Number(summary.appointments),
        completed: Number(summary.completed),
        pending: Number(summary.pending),
        cancelled: Number(summary.cancelled),
        newClients: Number(summary.new_clients),
        activeProjects: Number(summary.active_projects),
        completedProjects: Number(summary.completed_projects),
        documentsUploaded: Number(summary.documents_uploaded),
        documentsRejected: Number(summary.documents_rejected),
        documentsPending: Number(summary.documents_pending),
        estimatedValue: Number(summary.estimated_value),
        completedValue: Number(summary.completed_value),
        completionRate: Number(summary.appointments) ? Math.round((Number(summary.completed) / Number(summary.appointments)) * 1000) / 10 : 0,
      },
      charts: {
        byStatus: byStatus.map((s) => ({ status: s.status, total: Number(s.total) })),
        byService: byService.map((s) => ({
          name: s.name,
          total: Number(s.total),
          completed: Number(s.completed),
          value: Number(s.value),
          baseFee: Number(s.base_fee),
        })),
        byMonth: byMonth.map((m) => ({
          month: m.ym,
          total: Number(m.total),
          completed: Number(m.completed),
          cancelled: Number(m.cancelled),
        })),
        byWeekday: byWeekday.map((d) => ({ day: weekdayNames[Number(d.dow)] || '', total: Number(d.total) })),
        documents: documents.map((d) => ({ status: d.status, total: Number(d.total) })),
      },
      workload: workload.map((w) => ({
        id: w.id,
        name: w.full_name,
        position: w.position,
        maxDailyProjects: w.max_daily_projects,
        total: Number(w.total),
        completed: Number(w.completed),
        active: Number(w.active),
        leadProjects: Number(w.lead_projects),
      })),
      overdue: overdue.map((o) => ({
        id: o.id,
        projectNo: o.project_no,
        stage: o.stage,
        stageLabel: stageLabel(o.stage),
        targetCompletionDate: o.target_completion_date,
        serviceName: o.service_name,
        clientName: o.client_name,
        daysOverdue: Number(o.days_overdue),
      })),
      clients: clients.map((c) => ({
        id: c.id,
        fullName: c.full_name,
        email: c.email,
        phone: c.phone,
        createdAt: c.created_at,
        cityMunicipality: c.city_municipality,
        province: c.province,
        appointments: Number(c.appointments),
        projects: Number(c.projects),
      })),
      appointments: appointments.map((a) => ({
        id: a.id,
        referenceNo: a.reference_no,
        date: a.preferred_date,
        time: a.preferred_time,
        status: a.status,
        serviceName: a.service_name,
        clientName: a.client_name,
        surveyorName: a.surveyor_name,
        location: a.location_summary,
        fee: a.fee_estimate === null ? null : Number(a.fee_estimate),
      })),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* CSV export                                                         */
/* ------------------------------------------------------------------ */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Prevent CSV formula injection in spreadsheet apps.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map((h) => csvCell(h.label)).join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h.key])).join(','));
  // BOM keeps Excel happy with utf8 names (ñ, etc.)
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const type = String(req.query.type || 'appointments');

    const definitions = {
      appointments: {
        filename: `appointments_${from}_to_${to}`,
        sql: `SELECT a.reference_no, a.preferred_date, a.preferred_time, a.status, s.name AS service_name,
                     c.full_name AS client_name, c.email AS client_email, sv.full_name AS surveyor_name,
                     a.location_summary, a.fee_estimate, a.created_at
                FROM appointments a
                JOIN services s ON s.id = a.service_id
                JOIN users c ON c.id = a.client_id
                LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
               WHERE a.preferred_date BETWEEN ? AND ?
               ORDER BY a.preferred_date DESC, a.preferred_time DESC`,
        params: [from, to],
        headers: [
          { key: 'reference_no', label: 'Reference' },
          { key: 'preferred_date', label: 'Date' },
          { key: 'preferred_time', label: 'Time' },
          { key: 'status', label: 'Status' },
          { key: 'service_name', label: 'Service' },
          { key: 'client_name', label: 'Client' },
          { key: 'client_email', label: 'Client email' },
          { key: 'surveyor_name', label: 'Surveyor' },
          { key: 'location_summary', label: 'Location' },
          { key: 'fee_estimate', label: 'Fee estimate (PHP)' },
          { key: 'created_at', label: 'Requested at' },
        ],
      },
      clients: {
        filename: `client_registrations_${from}_to_${to}`,
        sql: `SELECT u.full_name, u.email, u.phone, cp.city_municipality, cp.province, u.created_at,
                     (SELECT COUNT(*) FROM appointments a WHERE a.client_id = u.id) AS appointments,
                     (SELECT COUNT(*) FROM survey_projects p WHERE p.client_id = u.id) AS projects
                FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
               WHERE u.role = 'client' AND u.deleted_at IS NULL AND DATE(u.created_at) BETWEEN ? AND ?
               ORDER BY u.created_at DESC`,
        params: [from, to],
        headers: [
          { key: 'full_name', label: 'Full name' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'city_municipality', label: 'City / Municipality' },
          { key: 'province', label: 'Province' },
          { key: 'appointments', label: 'Appointments' },
          { key: 'projects', label: 'Projects' },
          { key: 'created_at', label: 'Registered at' },
        ],
      },
      workload: {
        filename: `surveyor_workload_${from}_to_${to}`,
        sql: `SELECT u.full_name, sp.position, sp.license_no,
                     (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
                        AND a.preferred_date BETWEEN ? AND ? AND a.status NOT IN ('rejected','cancelled')) AS total,
                     (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
                        AND a.preferred_date BETWEEN ? AND ? AND a.status = 'completed') AS completed,
                     (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
                        AND a.status IN ('approved','confirmed','in_progress')) AS active
                FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id
               WHERE u.role = 'surveyor' AND u.deleted_at IS NULL
               ORDER BY total DESC`,
        params: [from, to, from, to],
        headers: [
          { key: 'full_name', label: 'Surveyor' },
          { key: 'position', label: 'Position' },
          { key: 'license_no', label: 'License no.' },
          { key: 'total', label: 'Assignments in period' },
          { key: 'completed', label: 'Completed in period' },
          { key: 'active', label: 'Active now' },
        ],
      },
      documents: {
        filename: `documents_${from}_to_${to}`,
        sql: `SELECT d.title, d.category, d.status, d.version, d.original_name, d.size_bytes, d.created_at,
                     c.full_name AS client_name, p.project_no, dr.name AS requirement_name
                FROM property_documents d
                JOIN users c ON c.id = d.client_id
                LEFT JOIN survey_projects p ON p.id = d.project_id
                LEFT JOIN document_requirements dr ON dr.id = d.requirement_id
               WHERE d.deleted_at IS NULL AND DATE(d.created_at) BETWEEN ? AND ?
               ORDER BY d.created_at DESC`,
        params: [from, to],
        headers: [
          { key: 'title', label: 'Document' },
          { key: 'requirement_name', label: 'Requirement' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Status' },
          { key: 'version', label: 'Version' },
          { key: 'original_name', label: 'File name' },
          { key: 'size_bytes', label: 'Size (bytes)' },
          { key: 'client_name', label: 'Client' },
          { key: 'project_no', label: 'Project' },
          { key: 'created_at', label: 'Uploaded at' },
        ],
      },
      services: {
        filename: `service_demand_${from}_to_${to}`,
        sql: `SELECT s.name, s.category, s.base_fee, COUNT(a.id) AS bookings,
                     SUM(a.status = 'completed') AS completed,
                     COALESCE(SUM(CASE WHEN a.status NOT IN ('rejected','cancelled') THEN a.fee_estimate ELSE 0 END), 0) AS value
                FROM services s LEFT JOIN appointments a ON a.service_id = s.id AND a.preferred_date BETWEEN ? AND ?
               GROUP BY s.id, s.name, s.category, s.base_fee
               ORDER BY bookings DESC`,
        params: [from, to],
        headers: [
          { key: 'name', label: 'Service' },
          { key: 'category', label: 'Category' },
          { key: 'base_fee', label: 'Base fee (PHP)' },
          { key: 'bookings', label: 'Bookings' },
          { key: 'completed', label: 'Completed' },
          { key: 'value', label: 'Estimated value (PHP)' },
        ],
      },
      projects: {
        filename: `projects_${from}_to_${to}`,
        sql: `SELECT p.project_no, p.stage, p.progress_percent, p.target_completion_date, p.created_at,
                     s.name AS service_name, u.full_name AS client_name, sv.full_name AS lead_surveyor,
                     pr.lot_no, pr.barangay, pr.city_municipality, pr.province
                FROM survey_projects p
                JOIN services s ON s.id = p.service_id
                JOIN users u ON u.id = p.client_id
                LEFT JOIN users sv ON sv.id = p.lead_surveyor_id
                LEFT JOIN properties pr ON pr.id = p.property_id
               WHERE DATE(p.created_at) BETWEEN ? AND ?
               ORDER BY p.created_at DESC`,
        params: [from, to],
        headers: [
          { key: 'project_no', label: 'Project no.' },
          { key: 'stage', label: 'Stage' },
          { key: 'progress_percent', label: 'Progress %' },
          { key: 'service_name', label: 'Service' },
          { key: 'client_name', label: 'Client' },
          { key: 'lead_surveyor', label: 'Lead surveyor' },
          { key: 'lot_no', label: 'Lot no.' },
          { key: 'barangay', label: 'Barangay' },
          { key: 'city_municipality', label: 'City / Municipality' },
          { key: 'province', label: 'Province' },
          { key: 'target_completion_date', label: 'Target completion' },
          { key: 'created_at', label: 'Created at' },
        ],
      },
    };

    const def = definitions[type];
    if (!def) throw badRequest('Unknown export type.');

    const rows = await query(def.sql, def.params);
    const csv = toCsv(def.headers, rows);

    await audit(req, 'report.export', `Exported ${type} CSV for ${from} to ${to}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${def.filename}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }),
);

module.exports = router;
