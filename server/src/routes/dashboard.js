'use strict';

const express = require('express');
const { query, one } = require('../db');
const { asyncHandler } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { todayManila, addDays } = require('../lib/slots');
const { stageLabel, STAGES } = require('../lib/stages');
const { humanSize } = require('../lib/files');

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Client dashboard                                                   */
/* ------------------------------------------------------------------ */
async function clientDashboard(userId) {
  const today = todayManila();

  const counts = await one(
    `SELECT
       (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status = 'pending') AS pending,
       (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status IN ('approved','confirmed','rescheduling_requested')) AS upcoming,
       (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status = 'completed') AS completed_appointments,
       (SELECT COUNT(*) FROM survey_projects WHERE client_id = ? AND archived_at IS NULL AND stage <> 'completed') AS active_projects,
       (SELECT COUNT(*) FROM survey_projects WHERE client_id = ? AND stage = 'completed') AS completed_projects,
       (SELECT COUNT(*) FROM property_documents WHERE client_id = ? AND status = 'rejected' AND deleted_at IS NULL) AS rejected_docs,
       (SELECT COUNT(*) FROM property_documents WHERE client_id = ? AND deleted_at IS NULL) AS total_docs,
       (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0) AS unread`,
    [userId, userId, userId, userId, userId, userId, userId, userId],
  );

  const nextAppointment = await one(
    `SELECT a.id, a.reference_no, a.status, a.preferred_date, a.preferred_time, a.location_summary,
            s.name AS service_name, sv.full_name AS surveyor_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
      WHERE a.client_id = ? AND a.preferred_date >= ?
        AND a.status IN ('pending','approved','confirmed','rescheduling_requested','in_progress')
      ORDER BY a.preferred_date, a.preferred_time LIMIT 1`,
    [userId, today],
  );

  const projects = await query(
    `SELECT p.id, p.project_no, p.stage, p.progress_percent, p.updated_at, s.name AS service_name,
            pr.lot_no, pr.barangay, pr.city_municipality
       FROM survey_projects p
       JOIN services s ON s.id = p.service_id
       LEFT JOIN properties pr ON pr.id = p.property_id
      WHERE p.client_id = ? AND p.archived_at IS NULL
      ORDER BY p.updated_at DESC LIMIT 4`,
    [userId],
  );

  const notifications = await query(
    `SELECT id, type, title, message, link, is_read, created_at FROM notifications
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
    [userId],
  );

  const recentDocuments = await query(
    `SELECT d.id, d.title, d.status, d.created_at, d.original_name, d.size_bytes
       FROM property_documents d WHERE d.client_id = ? AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC LIMIT 5`,
    [userId],
  );

  const upcoming = await query(
    `SELECT a.id, a.reference_no, a.preferred_date, a.preferred_time, a.status, s.name AS service_name
       FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.client_id = ? AND a.preferred_date >= ? AND a.status NOT IN ('cancelled','rejected','completed')
      ORDER BY a.preferred_date, a.preferred_time LIMIT 3`,
    [userId, today],
  );

  return {
    role: 'client',
    today,
    counts: {
      pending: Number(counts.pending),
      upcoming: Number(counts.upcoming),
      completedAppointments: Number(counts.completed_appointments),
      activeProjects: Number(counts.active_projects),
      completedProjects: Number(counts.completed_projects),
      rejectedDocuments: Number(counts.rejected_docs),
      totalDocuments: Number(counts.total_docs),
      unread: Number(counts.unread),
    },
    nextAppointment: nextAppointment
      ? {
          id: nextAppointment.id,
          referenceNo: nextAppointment.reference_no,
          status: nextAppointment.status,
          date: nextAppointment.preferred_date,
          time: nextAppointment.preferred_time,
          location: nextAppointment.location_summary,
          serviceName: nextAppointment.service_name,
          surveyorName: nextAppointment.surveyor_name,
        }
      : null,
    projects: projects.map((p) => ({
      id: p.id,
      projectNo: p.project_no,
      stage: p.stage,
      stageLabel: stageLabel(p.stage),
      progressPercent: p.progress_percent,
      updatedAt: p.updated_at,
      serviceName: p.service_name,
      lotNo: p.lot_no,
      location: [p.barangay, p.city_municipality].filter(Boolean).join(', '),
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      isRead: !!n.is_read,
      createdAt: n.created_at,
    })),
    recentDocuments: recentDocuments.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      createdAt: d.created_at,
      fileName: d.original_name,
      size: humanSize(d.size_bytes),
    })),
    upcoming: upcoming.map((a) => ({
      id: a.id,
      referenceNo: a.reference_no,
      date: a.preferred_date,
      time: a.preferred_time,
      status: a.status,
      serviceName: a.service_name,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Surveyor dashboard                                                 */
/* ------------------------------------------------------------------ */
async function staffDashboard(userId) {
  const today = todayManila();
  const weekEnd = addDays(today, 7);

  const assigned = await query(
    `SELECT p.id, p.project_no, p.stage, p.progress_percent, p.target_completion_date,
            s.name AS service_name, c.full_name AS client_name,
            pr.lot_no, pr.barangay, pr.city_municipality, pr.province, pr.address_line,
            a.reference_no, a.preferred_date, a.preferred_time, a.status AS appointment_status
       FROM survey_projects p
       JOIN services s ON s.id = p.service_id
       JOIN users c ON c.id = p.client_id
       LEFT JOIN properties pr ON pr.id = p.property_id
       JOIN appointments a ON a.id = p.appointment_id
      WHERE p.archived_at IS NULL
        AND (p.lead_surveyor_id = ?
             OR EXISTS (SELECT 1 FROM project_assignments pa
                         WHERE pa.project_id = p.id AND pa.staff_id = ? AND pa.unassigned_at IS NULL))
      ORDER BY a.preferred_date ASC`,
    [userId, userId],
  );

  const todaySchedule = await query(
    `SELECT a.id, a.reference_no, a.status, a.preferred_date, a.preferred_time, a.duration_minutes,
            a.location_summary, s.name AS service_name, c.full_name AS client_name,
            pr.lot_no, pr.barangay, pr.city_municipality, pr.province, pr.address_line,
            p.id AS project_id, p.project_no
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users c ON c.id = a.client_id
       LEFT JOIN survey_projects p ON p.appointment_id = a.id
       LEFT JOIN properties pr ON pr.id = a.property_id
      WHERE a.assigned_surveyor_id = ? AND a.preferred_date = ?
        AND a.status IN ('approved','confirmed','in_progress')
      ORDER BY a.preferred_time`,
    [userId, today],
  );

  const weekSchedule = await query(
    `SELECT a.id, a.reference_no, a.status, a.preferred_date, a.preferred_time, a.location_summary,
            s.name AS service_name, c.full_name AS client_name, p.id AS project_id, p.project_no
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users c ON c.id = a.client_id
       LEFT JOIN survey_projects p ON p.appointment_id = a.id
      WHERE a.assigned_surveyor_id = ? AND a.preferred_date BETWEEN ? AND ?
        AND a.status IN ('approved','confirmed','in_progress')
      ORDER BY a.preferred_date, a.preferred_time`,
    [userId, today, weekEnd],
  );

  const counts = await one(
    `SELECT
       (SELECT COUNT(*) FROM appointments WHERE assigned_surveyor_id = ? AND preferred_date = ?
          AND status IN ('approved','confirmed')) AS today_count,
       (SELECT COUNT(*) FROM survey_projects p WHERE p.archived_at IS NULL
          AND (p.lead_surveyor_id = ? OR EXISTS (SELECT 1 FROM project_assignments pa
                WHERE pa.project_id = p.id AND pa.staff_id = ? AND pa.unassigned_at IS NULL))) AS active_projects,
       (SELECT COUNT(*) FROM appointments WHERE assigned_surveyor_id = ? AND status = 'in_progress') AS in_progress,
       (SELECT COUNT(*) FROM appointments WHERE assigned_surveyor_id = ? AND status = 'completed') AS completed,
       (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0) AS unread`,
    [userId, today, userId, userId, userId, userId, userId],
  );

  return {
    role: 'surveyor',
    today,
    counts: {
      todayAppointments: Number(counts.today_count),
      activeProjects: Number(counts.active_projects),
      inProgress: Number(counts.in_progress),
      completed: Number(counts.completed),
      unread: Number(counts.unread),
    },
    todaySchedule: todaySchedule.map((a) => ({
      id: a.id,
      referenceNo: a.reference_no,
      status: a.status,
      date: a.preferred_date,
      time: a.preferred_time,
      durationMinutes: a.duration_minutes,
      location: a.location_summary || [a.address_line, a.barangay, a.city_municipality].filter(Boolean).join(', '),
      serviceName: a.service_name,
      clientName: a.client_name,
      lotNo: a.lot_no,
      projectId: a.project_id,
      projectNo: a.project_no,
    })),
    weekSchedule: weekSchedule.map((a) => ({
      id: a.id,
      referenceNo: a.reference_no,
      status: a.status,
      date: a.preferred_date,
      time: a.preferred_time,
      location: a.location_summary,
      serviceName: a.service_name,
      clientName: a.client_name,
      projectId: a.project_id,
      projectNo: a.project_no,
    })),
    projects: assigned.map((p) => ({
      id: p.id,
      projectNo: p.project_no,
      stage: p.stage,
      stageLabel: stageLabel(p.stage),
      progressPercent: p.progress_percent,
      targetCompletionDate: p.target_completion_date,
      serviceName: p.service_name,
      clientName: p.client_name,
      referenceNo: p.reference_no,
      date: p.preferred_date,
      time: p.preferred_time,
      appointmentStatus: p.appointment_status,
      lotNo: p.lot_no,
      location: [p.barangay, p.city_municipality, p.province].filter(Boolean).join(', '),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Admin dashboard                                                    */
/* ------------------------------------------------------------------ */
async function adminDashboard() {
  const today = todayManila();

  const counts = await one(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'client' AND deleted_at IS NULL) AS clients,
       (SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) AS new_clients_month,
       (SELECT COUNT(*) FROM appointments) AS appointments,
       (SELECT COUNT(*) FROM appointments WHERE preferred_date = ?) AS appointments_today,
       (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending_requests,
       (SELECT COUNT(*) FROM appointments WHERE status = 'rescheduling_requested') AS reschedule_requests,
       (SELECT COUNT(*) FROM survey_projects WHERE archived_at IS NULL AND stage NOT IN ('completed','archived')) AS active_surveys,
       (SELECT COUNT(*) FROM survey_projects WHERE stage = 'completed') AS completed_surveys,
       (SELECT COUNT(*) FROM property_documents WHERE deleted_at IS NULL) AS documents,
       (SELECT COUNT(*) FROM property_documents WHERE status = 'submitted' AND deleted_at IS NULL) AS docs_pending,
       (SELECT COUNT(*) FROM blueprints WHERE status IN ('draft','for_review')) AS blueprints_pending,
       (SELECT COUNT(*) FROM inquiries WHERE status = 'new') AS new_inquiries,
       (SELECT COUNT(*) FROM users WHERE role = 'surveyor' AND is_active = 1 AND deleted_at IS NULL) AS staff`,
    [today],
  );

  const todaysAppointments = await query(
    `SELECT a.id, a.reference_no, a.status, a.preferred_time, a.duration_minutes, a.location_summary,
            s.name AS service_name, c.full_name AS client_name, sv.full_name AS surveyor_name,
            p.lot_no, p.barangay, p.city_municipality
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users c ON c.id = a.client_id
       LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
       LEFT JOIN properties p ON p.id = a.property_id
      WHERE a.preferred_date = ? AND a.status NOT IN ('cancelled','rejected')
      ORDER BY a.preferred_time`,
    [today],
  );

  const upcoming = await query(
    `SELECT a.id, a.reference_no, a.status, a.preferred_date, a.preferred_time, a.location_summary,
            s.name AS service_name, c.full_name AS client_name, sv.full_name AS surveyor_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users c ON c.id = a.client_id
       LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
      WHERE a.preferred_date > ? AND a.status IN ('approved','confirmed')
      ORDER BY a.preferred_date, a.preferred_time LIMIT 6`,
    [today],
  );

  // Last 6 months of booking volume for the trend chart.
  const monthly = await query(
    `SELECT DATE_FORMAT(preferred_date, '%Y-%m') AS ym, COUNT(*) AS total,
            SUM(status = 'completed') AS completed, SUM(status = 'pending') AS pending
       FROM appointments
      WHERE preferred_date >= DATE_SUB(?, INTERVAL 5 MONTH)
      GROUP BY ym ORDER BY ym`,
    [today],
  );

  const stageRows = await query(
    `SELECT stage, COUNT(*) AS total FROM survey_projects WHERE archived_at IS NULL GROUP BY stage`,
  );

  const serviceDemand = await query(
    `SELECT s.name, COUNT(a.id) AS total, COALESCE(SUM(a.fee_estimate), 0) AS value
       FROM services s LEFT JOIN appointments a ON a.service_id = s.id
      GROUP BY s.id, s.name ORDER BY total DESC LIMIT 6`,
  );

  const activity = await query(
    `SELECT l.id, l.action, l.description, l.created_at, u.full_name AS actor_name, l.actor_role
       FROM activity_logs l LEFT JOIN users u ON u.id = l.actor_id
      ORDER BY l.created_at DESC LIMIT 8`,
  );

  const workload = await query(
    `SELECT u.id, u.full_name, sp.position,
            (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
              AND a.status IN ('approved','confirmed','in_progress')) AS active,
            (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
              AND a.preferred_date = ? AND a.status IN ('approved','confirmed','in_progress')) AS today_load
       FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'surveyor' AND u.is_active = 1 AND u.deleted_at IS NULL
      ORDER BY active DESC`,
    [today],
  );

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return {
    role: 'admin',
    today,
    counts: {
      clients: Number(counts.clients),
      newClientsThisMonth: Number(counts.new_clients_month),
      appointments: Number(counts.appointments),
      appointmentsToday: Number(counts.appointments_today),
      pendingRequests: Number(counts.pending_requests),
      rescheduleRequests: Number(counts.reschedule_requests),
      activeSurveys: Number(counts.active_surveys),
      completedSurveys: Number(counts.completed_surveys),
      documents: Number(counts.documents),
      documentsPendingReview: Number(counts.docs_pending),
      blueprintsPending: Number(counts.blueprints_pending),
      newInquiries: Number(counts.new_inquiries),
      staff: Number(counts.staff),
    },
    todaysAppointments: todaysAppointments.map((a) => ({
      id: a.id,
      referenceNo: a.reference_no,
      status: a.status,
      time: a.preferred_time,
      durationMinutes: a.duration_minutes,
      location: a.location_summary,
      serviceName: a.service_name,
      clientName: a.client_name,
      surveyorName: a.surveyor_name,
      lotNo: a.lot_no,
      barangay: a.barangay,
      cityMunicipality: a.city_municipality,
    })),
    upcoming: upcoming.map((a) => ({
      id: a.id,
      referenceNo: a.reference_no,
      status: a.status,
      date: a.preferred_date,
      time: a.preferred_time,
      location: a.location_summary,
      serviceName: a.service_name,
      clientName: a.client_name,
      surveyorName: a.surveyor_name,
    })),
    charts: {
      monthly: monthly.map((m) => ({
        month: `${monthNames[Number(String(m.ym).slice(5, 7)) - 1]} ${String(m.ym).slice(2, 4)}`,
        total: Number(m.total),
        completed: Number(m.completed),
        pending: Number(m.pending),
      })),
      stages: STAGES.filter((s) => s.key !== 'archived').map((s) => ({
        stage: s.label,
        shortLabel: s.label.replace('Data Processing & Plan Preparation', 'Data Processing'),
        total: Number((stageRows.find((r) => r.stage === s.key) || { total: 0 }).total),
      })),
      services: serviceDemand.map((s) => ({
        name: s.name.length > 22 ? `${s.name.slice(0, 20)}…` : s.name,
        total: Number(s.total),
        value: Number(s.value),
      })),
    },
    workload: workload.map((w) => ({
      id: w.id,
      name: w.full_name,
      position: w.position,
      active: Number(w.active),
      todayLoad: Number(w.today_load),
    })),
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      description: a.description,
      actor: a.actor_name || 'System',
      actorRole: a.actor_role,
      createdAt: a.created_at,
    })),
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'client') return res.json(await clientDashboard(req.user.id));
    if (req.user.role === 'surveyor') return res.json(await staffDashboard(req.user.id));
    return res.json(await adminDashboard());
  }),
);

module.exports = router;
module.exports.adminDashboard = adminDashboard;
module.exports.staffDashboard = staffDashboard;
