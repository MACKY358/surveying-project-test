'use strict';

/**
 * Canonical project pipeline used across the API and UI.
 * Order matters: index is used to prevent silent backwards moves.
 */
const STAGES = [
  { key: 'request_submitted', label: 'Request Submitted', progress: 5, description: 'Your request has been received by the office.' },
  { key: 'initial_review', label: 'Initial Review', progress: 12, description: 'The office is reviewing your request and property details.' },
  { key: 'documents_incomplete', label: 'Documents Incomplete', progress: 20, description: 'Additional or corrected documents are needed.' },
  { key: 'documents_under_review', label: 'Documents Under Review', progress: 30, description: 'Submitted documents are being verified by staff.' },
  { key: 'appointment_confirmed', label: 'Appointment Confirmed', progress: 45, description: 'Your survey appointment has been confirmed.' },
  { key: 'field_survey_scheduled', label: 'Field Survey Scheduled', progress: 58, description: 'A field team has been scheduled for your property.' },
  { key: 'field_survey_in_progress', label: 'Field Survey In Progress', progress: 70, description: 'Fieldwork is currently being conducted.' },
  { key: 'data_processing', label: 'Data Processing & Plan Preparation', progress: 80, description: 'Field data is being processed and the plan is being prepared.' },
  { key: 'professional_review', label: 'Professional Review', progress: 88, description: 'A licensed professional is reviewing the prepared plan.' },
  { key: 'documents_ready', label: 'Documents Ready for Release', progress: 95, description: 'Approved documents are ready for release to you.' },
  { key: 'completed', label: 'Completed', progress: 100, description: 'The survey engagement is complete.' },
  { key: 'archived', label: 'Archived', progress: 100, description: 'The project has been archived.' },
];

/** Only these stages are settable manually (archived is a separate action). */
const MANUAL_STAGES = STAGES.filter((s) => s.key !== 'archived');

const MAP = new Map(STAGES.map((s, i) => [s.key, { ...s, order: i }]));

function getStage(key) {
  return MAP.get(key) || null;
}

function stageLabel(key) {
  const stage = getStage(key);
  return stage ? stage.label : key;
}

function stageOrder(key) {
  const stage = getStage(key);
  return stage ? stage.order : 0;
}

function progressFor(key) {
  const stage = getStage(key);
  return stage ? stage.progress : 0;
}

function isStage(key) {
  return MAP.has(key);
}

/** Human readable status labels for appointments. */
const APPOINTMENT_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'rescheduling_requested',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
];

const APPOINTMENT_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  rescheduling_requested: 'Rescheduling Requested',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

module.exports = {
  STAGES,
  MANUAL_STAGES,
  getStage,
  stageLabel,
  stageOrder,
  progressFor,
  isStage,
  APPOINTMENT_STATUSES,
  APPOINTMENT_LABELS,
};
