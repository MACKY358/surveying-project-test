-- ===========================================================================
-- Land Surveying Management System - relational schema
-- Engine: MariaDB 10.4+ / MySQL 8.0+  (utf8mb4)
--
-- Design notes
--  * Files live on disk; only metadata + storage reference is stored here.
--  * Every table carries created_at/updated_at for auditability.
--  * Foreign keys use ON DELETE restrictions to protect legal records.
--  * A project is created from an approved appointment (1:1).
-- ===========================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS inquiries;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS field_notes;
DROP TABLE IF EXISTS project_status_history;
DROP TABLE IF EXISTS blueprint_versions;
DROP TABLE IF EXISTS blueprints;
DROP TABLE IF EXISTS property_documents;
DROP TABLE IF EXISTS document_requirements;
DROP TABLE IF EXISTS surveying_schedules;
DROP TABLE IF EXISTS project_assignments;
DROP TABLE IF EXISTS survey_projects;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS properties;
DROP TABLE IF EXISTS service_fees;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS business_hours;
DROP TABLE IF EXISTS office_settings;
DROP TABLE IF EXISTS staff_profiles;
DROP TABLE IF EXISTS client_profiles;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Accounts and profiles
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role            ENUM('client','admin','surveyor') NOT NULL DEFAULT 'client',
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(150) NOT NULL,
  phone           VARCHAR(40) DEFAULT NULL,
  avatar_initials VARCHAR(4) DEFAULT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    DATETIME DEFAULT NULL,
  last_login_at   DATETIME DEFAULT NULL,
  privacy_accepted_at DATETIME DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE client_profiles (
  user_id           INT UNSIGNED NOT NULL,
  address_line      VARCHAR(255) DEFAULT NULL,
  barangay          VARCHAR(120) DEFAULT NULL,
  city_municipality VARCHAR(120) DEFAULT NULL,
  province          VARCHAR(120) DEFAULT NULL,
  postal_code       VARCHAR(12) DEFAULT NULL,
  valid_id_type     VARCHAR(80) DEFAULT NULL,
  valid_id_number   VARCHAR(80) DEFAULT NULL,
  client_type       ENUM('individual','company','government') NOT NULL DEFAULT 'individual',
  company_name      VARCHAR(160) DEFAULT NULL,
  notes             TEXT DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_client_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff_profiles (
  user_id            INT UNSIGNED NOT NULL,
  employee_no        VARCHAR(30) DEFAULT NULL,
  position           VARCHAR(100) DEFAULT NULL,
  license_no         VARCHAR(60) DEFAULT NULL,
  specialization     VARCHAR(160) DEFAULT NULL,
  max_daily_projects INT NOT NULL DEFAULT 3,
  hire_date          DATE DEFAULT NULL,
  notes              TEXT DEFAULT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_staff_employee_no (employee_no),
  CONSTRAINT fk_staff_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server-side session store (only a SHA-256 hash of the cookie token is kept)
CREATE TABLE sessions (
  id          CHAR(64) NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  ip_address  VARCHAR(45) DEFAULT NULL,
  user_agent  VARCHAR(255) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sessions_user (user_id, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Services, fees, document requirements
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code              VARCHAR(30) NOT NULL,
  name              VARCHAR(150) NOT NULL,
  short_name        VARCHAR(60) DEFAULT NULL,
  description       TEXT DEFAULT NULL,
  category          ENUM('survey','documentation','consultation') NOT NULL DEFAULT 'survey',
  base_fee          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  duration_minutes  INT NOT NULL DEFAULT 120,
  requires_fieldwork TINYINT(1) NOT NULL DEFAULT 1,
  turnaround_days   INT NOT NULL DEFAULT 14,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_fees (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id     INT UNSIGNED NOT NULL,
  name           VARCHAR(150) NOT NULL,
  description    VARCHAR(255) DEFAULT NULL,
  amount         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  is_optional    TINYINT(1) NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  effective_from DATE DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_service_fees_service (service_id),
  CONSTRAINT fk_service_fees_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE document_requirements (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id     INT UNSIGNED DEFAULT NULL,
  code           VARCHAR(60) NOT NULL,
  name           VARCHAR(160) NOT NULL,
  description    VARCHAR(500) DEFAULT NULL,
  is_required    TINYINT(1) NOT NULL DEFAULT 1,
  allowed_types  VARCHAR(160) NOT NULL DEFAULT 'pdf,jpg,jpeg,png',
  max_size_mb    INT NOT NULL DEFAULT 15,
  sort_order     INT NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_requirement (service_id, code),
  CONSTRAINT fk_requirements_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Office configuration
-- ---------------------------------------------------------------------------
CREATE TABLE office_settings (
  setting_key   VARCHAR(80) NOT NULL,
  setting_value TEXT DEFAULT NULL,
  updated_by    INT UNSIGNED DEFAULT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_hours (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  weekday      TINYINT NOT NULL COMMENT '0=Sunday .. 6=Saturday',
  open_time    TIME NOT NULL DEFAULT '08:00:00',
  close_time   TIME NOT NULL DEFAULT '17:00:00',
  break_start  TIME DEFAULT NULL,
  break_end    TIME DEFAULT NULL,
  is_closed    TINYINT(1) NOT NULL DEFAULT 0,
  slot_minutes INT NOT NULL DEFAULT 60,
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_hours_weekday (weekday)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------
CREATE TABLE properties (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id          INT UNSIGNED NOT NULL,
  title_holder       VARCHAR(180) DEFAULT NULL,
  lot_no             VARCHAR(60) DEFAULT NULL,
  block_no           VARCHAR(60) DEFAULT NULL,
  barangay           VARCHAR(120) DEFAULT NULL,
  city_municipality  VARCHAR(120) DEFAULT NULL,
  province           VARCHAR(120) DEFAULT NULL,
  address_line       VARCHAR(255) DEFAULT NULL,
  area_sqm           DECIMAL(14,2) DEFAULT NULL,
  title_no           VARCHAR(80) DEFAULT NULL,
  tax_declaration_no VARCHAR(80) DEFAULT NULL,
  latitude           DECIMAL(10,7) DEFAULT NULL,
  longitude          DECIMAL(10,7) DEFAULT NULL,
  notes              TEXT DEFAULT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_properties_client (client_id),
  KEY idx_properties_lot (lot_no, barangay),
  CONSTRAINT fk_properties_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id                        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference_no              VARCHAR(24) NOT NULL,
  client_id                 INT UNSIGNED NOT NULL,
  property_id               INT UNSIGNED DEFAULT NULL,
  service_id                INT UNSIGNED NOT NULL,
  preferred_date            DATE NOT NULL,
  preferred_time            TIME NOT NULL,
  duration_minutes          INT NOT NULL DEFAULT 120,
  status                    ENUM('pending','approved','rejected','rescheduling_requested','confirmed','in_progress','completed','cancelled')
                            NOT NULL DEFAULT 'pending',
  assigned_surveyor_id      INT UNSIGNED DEFAULT NULL,
  location_summary          VARCHAR(255) DEFAULT NULL,
  client_notes              TEXT DEFAULT NULL,
  admin_notes               TEXT DEFAULT NULL,
  rejection_reason          VARCHAR(500) DEFAULT NULL,
  reschedule_requested_date DATE DEFAULT NULL,
  reschedule_requested_time TIME DEFAULT NULL,
  reschedule_reason         VARCHAR(500) DEFAULT NULL,
  fee_estimate              DECIMAL(12,2) DEFAULT NULL,
  approved_by               INT UNSIGNED DEFAULT NULL,
  approved_at               DATETIME DEFAULT NULL,
  confirmed_at              DATETIME DEFAULT NULL,
  started_at                DATETIME DEFAULT NULL,
  completed_at              DATETIME DEFAULT NULL,
  cancelled_at              DATETIME DEFAULT NULL,
  cancellation_reason       VARCHAR(500) DEFAULT NULL,
  created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_appointments_reference (reference_no),
  KEY idx_appointments_client (client_id, preferred_date),
  KEY idx_appointments_surveyor (assigned_surveyor_id, preferred_date, preferred_time),
  KEY idx_appointments_status (status, preferred_date),
  CONSTRAINT fk_appointments_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT fk_appointments_service FOREIGN KEY (service_id) REFERENCES services (id),
  CONSTRAINT fk_appointments_surveyor FOREIGN KEY (assigned_surveyor_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_appointments_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
CREATE TABLE survey_projects (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_no             VARCHAR(24) NOT NULL,
  appointment_id         INT UNSIGNED NOT NULL,
  client_id              INT UNSIGNED NOT NULL,
  property_id            INT UNSIGNED DEFAULT NULL,
  service_id             INT UNSIGNED NOT NULL,
  stage                  VARCHAR(40) NOT NULL DEFAULT 'request_submitted',
  progress_percent       TINYINT UNSIGNED NOT NULL DEFAULT 5,
  lead_surveyor_id       INT UNSIGNED DEFAULT NULL,
  summary                TEXT DEFAULT NULL,
  target_completion_date DATE DEFAULT NULL,
  started_at             DATETIME DEFAULT NULL,
  completed_at           DATETIME DEFAULT NULL,
  archived_at            DATETIME DEFAULT NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_no (project_no),
  UNIQUE KEY uq_projects_appointment (appointment_id),
  KEY idx_projects_client (client_id, archived_at),
  KEY idx_projects_stage (stage, archived_at),
  CONSTRAINT fk_projects_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_service FOREIGN KEY (service_id) REFERENCES services (id),
  CONSTRAINT fk_projects_lead FOREIGN KEY (lead_surveyor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_assignments (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id      INT UNSIGNED NOT NULL,
  staff_id        INT UNSIGNED NOT NULL,
  role_in_project VARCHAR(80) NOT NULL DEFAULT 'Field Surveyor',
  assigned_by     INT UNSIGNED DEFAULT NULL,
  assigned_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at   DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_assignments_project (project_id, unassigned_at),
  KEY idx_assignments_staff (staff_id, unassigned_at),
  CONSTRAINT fk_assignments_project FOREIGN KEY (project_id) REFERENCES survey_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_staff FOREIGN KEY (staff_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE surveying_schedules (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id     INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED DEFAULT NULL,
  staff_id       INT UNSIGNED DEFAULT NULL,
  schedule_type  ENUM('fieldwork','office_work','review','meeting','other') NOT NULL DEFAULT 'fieldwork',
  title          VARCHAR(160) NOT NULL,
  starts_at      DATETIME NOT NULL,
  ends_at        DATETIME NOT NULL,
  location       VARCHAR(255) DEFAULT NULL,
  status         ENUM('scheduled','in_progress','completed','cancelled','conflict') NOT NULL DEFAULT 'scheduled',
  notes          TEXT DEFAULT NULL,
  created_by     INT UNSIGNED DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_schedules_staff_time (staff_id, starts_at),
  KEY idx_schedules_project (project_id, starts_at),
  CONSTRAINT fk_schedules_project FOREIGN KEY (project_id) REFERENCES survey_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL,
  CONSTRAINT fk_schedules_staff FOREIGN KEY (staff_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_schedules_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE field_notes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT UNSIGNED NOT NULL,
  author_id    INT UNSIGNED NOT NULL,
  note_type    ENUM('note','measurement','issue','follow_up','completion') NOT NULL DEFAULT 'note',
  measurement  VARCHAR(160) DEFAULT NULL,
  body         TEXT NOT NULL,
  recorded_on  DATE DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_field_notes_project (project_id, created_at),
  CONSTRAINT fk_field_notes_project FOREIGN KEY (project_id) REFERENCES survey_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_field_notes_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_status_history (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT UNSIGNED NOT NULL,
  from_stage   VARCHAR(40) DEFAULT NULL,
  to_stage     VARCHAR(40) NOT NULL,
  note         VARCHAR(500) DEFAULT NULL,
  changed_by   INT UNSIGNED DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_project (project_id, created_at),
  CONSTRAINT fk_history_project FOREIGN KEY (project_id) REFERENCES survey_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
CREATE TABLE property_documents (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id    INT UNSIGNED DEFAULT NULL,
  client_id      INT UNSIGNED NOT NULL,
  project_id     INT UNSIGNED DEFAULT NULL,
  appointment_id INT UNSIGNED DEFAULT NULL,
  requirement_id INT UNSIGNED DEFAULT NULL,
  category       VARCHAR(80) NOT NULL DEFAULT 'other',
  title          VARCHAR(180) NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(190) NOT NULL,
  mime_type      VARCHAR(120) NOT NULL,
  size_bytes     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status         ENUM('submitted','under_review','approved','rejected','superseded') NOT NULL DEFAULT 'submitted',
  version        INT NOT NULL DEFAULT 1,
  supersedes_id  INT UNSIGNED DEFAULT NULL,
  uploaded_by    INT UNSIGNED NOT NULL,
  reviewed_by    INT UNSIGNED DEFAULT NULL,
  review_notes   VARCHAR(500) DEFAULT NULL,
  reviewed_at    DATETIME DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_docs_client (client_id, status),
  KEY idx_docs_project (project_id, deleted_at),
  KEY idx_docs_requirement (requirement_id),
  KEY idx_docs_status (status, created_at),
  CONSTRAINT fk_docs_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_docs_project FOREIGN KEY (project_id) REFERENCES survey_projects (id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_requirement FOREIGN KEY (requirement_id) REFERENCES document_requirements (id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_docs_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_supersedes FOREIGN KEY (supersedes_id) REFERENCES property_documents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Blueprints / survey plans
-- ---------------------------------------------------------------------------
CREATE TABLE blueprints (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id      INT UNSIGNED NOT NULL,
  property_id     INT UNSIGNED DEFAULT NULL,
  lot_no          VARCHAR(60) DEFAULT NULL,
  title           VARCHAR(180) NOT NULL,
  description     TEXT DEFAULT NULL,
  current_version INT NOT NULL DEFAULT 0,
  status          ENUM('draft','for_review','approved_for_release','archived') NOT NULL DEFAULT 'draft',
  created_by      INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_blueprints_project (project_id, status),
  KEY idx_blueprints_lot (lot_no),
  CONSTRAINT fk_blueprints_project FOREIGN KEY (project_id) REFERENCES survey_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_blueprints_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT fk_blueprints_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blueprint_versions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  blueprint_id   INT UNSIGNED NOT NULL,
  version_no     INT NOT NULL DEFAULT 1,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(190) NOT NULL,
  mime_type      VARCHAR(120) NOT NULL,
  size_bytes     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  revision_notes VARCHAR(500) DEFAULT NULL,
  internal_notes TEXT DEFAULT NULL,
  status         ENUM('draft','for_review','approved_for_release','archived') NOT NULL DEFAULT 'draft',
  uploaded_by    INT UNSIGNED NOT NULL,
  approved_by    INT UNSIGNED DEFAULT NULL,
  approved_at    DATETIME DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blueprint_version (blueprint_id, version_no),
  KEY idx_blueprint_versions_status (status),
  CONSTRAINT fk_bv_blueprint FOREIGN KEY (blueprint_id) REFERENCES blueprints (id) ON DELETE CASCADE,
  CONSTRAINT fk_bv_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_bv_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Notifications, messaging, inquiries
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       VARCHAR(40) NOT NULL DEFAULT 'general',
  title      VARCHAR(180) NOT NULL,
  message    VARCHAR(500) NOT NULL,
  link       VARCHAR(255) DEFAULT NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  read_at    DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversations (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id  INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED DEFAULT NULL,
  subject    VARCHAR(180) NOT NULL,
  status     ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_conversations_client (client_id, updated_at),
  CONSTRAINT fk_conversations_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_project FOREIGN KEY (project_id) REFERENCES survey_projects (id) ON DELETE SET NULL,
  CONSTRAINT fk_conversations_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id       INT UNSIGNED NOT NULL,
  body            TEXT NOT NULL,
  read_at         DATETIME DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_conversation (conversation_id, created_at),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inquiries (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(150) NOT NULL,
  email      VARCHAR(190) NOT NULL,
  phone      VARCHAR(40) DEFAULT NULL,
  subject    VARCHAR(180) NOT NULL,
  message    TEXT NOT NULL,
  status     ENUM('new','read','responded','closed') NOT NULL DEFAULT 'new',
  handled_by INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inquiries_status (status, created_at),
  CONSTRAINT fk_inquiries_handler FOREIGN KEY (handled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE activity_logs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    INT UNSIGNED DEFAULT NULL,
  actor_role  VARCHAR(20) DEFAULT NULL,
  action      VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) DEFAULT NULL,
  entity_id   INT UNSIGNED DEFAULT NULL,
  description VARCHAR(500) NOT NULL,
  ip_address  VARCHAR(45) DEFAULT NULL,
  user_agent  VARCHAR(255) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_created (created_at),
  KEY idx_logs_actor (actor_id, created_at),
  KEY idx_logs_entity (entity_type, entity_id),
  CONSTRAINT fk_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
