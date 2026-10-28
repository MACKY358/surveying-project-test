# Trompeta Surveying â€” Land Surveying Management System

A complete, self-hosted management system for a Philippine land-surveying practice: a public
marketing website, a client portal, an administrator back office, and a field-surveyor portal,
backed by a MySQL/MariaDB database.

The demo company, staff and property records are fictional. The application is functional â€”
bookings, approvals, document review, blueprint release, messaging, reports and audit logs all
persist to the database and are protected by server-side authorization.

> **Email and SMS delivery are not configured.** The system creates in-app notifications only.
> The UI never claims that an email or text message was sent. See
> [Features intentionally not enabled](#features-intentionally-not-enabled).

---

## Contents

1. [Feature tour](#feature-tour)
2. [Technology](#technology)
3. [Repository layout](#repository-layout)
4. [Getting started](#getting-started)
5. [Demo accounts](#demo-accounts)
6. [Configuration reference](#configuration-reference)
7. [Production build](#production-build)
8. [Data model](#data-model)
9. [Workflows and statuses](#workflows-and-statuses)
10. [Security](#security)
11. [Privacy and the Data Privacy Act](#privacy-and-the-data-privacy-act)
12. [Features intentionally not enabled](#features-intentionally-not-enabled)
13. [Verification performed](#verification-performed)
14. [Troubleshooting](#troubleshooting)
15. [Go-live checklist](#go-live-checklist)

---

## Feature tour

### Public website (`/`)

- Service catalogue with base fees, typical duration and turnaround, pulled from the database.
- Office information, business hours, contact details, PRC licence and privacy officer.
- Four-step explanation of the survey process and an inquiry form with a honeypot and rate limit.
- Privacy notice page and client self-registration.
- Fully responsive navigation, no horizontal scrolling down to 360 px.

### Client portal (`/app`)

| Area | What a client can do |
| --- | --- |
| Dashboard | See upcoming visits, active projects, documents needing attention and released plans. |
| Book a survey | Four-step wizard: service â†’ property details â†’ available date/time â†’ review. Attach up to six requirement files, accept the privacy notice, and submit. |
| Appointments | Filter and search requests; open a request to see the timeline, office notes and assigned surveyor; request a reschedule or cancel according to policy. |
| Projects | Track every project through the stage rail, progress history, field notes, documents and released drawings. |
| Documents | Upload requirements (multiple files, versioned), see review status and reviewer notes, download originals. |
| Survey plans | Browse plans released to the client and open the zoomable/pannable PDF or image viewer. |
| Messages | Threaded conversations with the office, unread counts. |
| Notifications | In-app notification centre with mark-read / mark-all-read. |
| Profile | Update contact details, change password, review and revoke active sessions. |

Clients can only see their own appointments, projects, documents, plans and conversations. Files
are never served from a public directory â€” every download goes through an authenticated route.

### Administrator back office (`/admin`)

| Area | What an administrator can do |
| --- | --- |
| Dashboard | Request queue, today's field schedule, document backlog, plan releases, client and inquiry counts, revenue snapshot, charts. |
| Appointment requests | Approve and assign a surveyor, reject with a reason, confirm, reschedule, resolve reschedule requests, start/complete fieldwork, cancel. Conflicts are checked against both the surveyor and the client. |
| Schedule calendar | Month / week / day / agenda views, surveyor filter, conflict-aware scheduling, appointment detail. |
| Projects | All projects, stage filters, progress updates with notes and target dates, archive. |
| Document review | Approve, reject or mark documents under review with reviewer notes; version history. |
| Survey plans | Create blueprints, upload revisions, release to client, archive; retained version history. |
| Clients | Search, view full client record (contact, properties, appointments, projects, documents, activity) and update internal notes. |
| Staff | Create administrator/surveyor accounts, edit profiles, reset passwords, activate/deactivate. |
| Services & fees | Manage services, fee lines and document requirements (including allowed file types and size limits). |
| Reports | Date-ranged aggregates for appointments, revenue, projects, services and surveyor workload, plus CSV export. |
| Activity log | Filterable audit trail of sign-ins, bookings, decisions, uploads, downloads, releases and settings changes. |
| Inquiries | Review and update the status of website inquiries. |
| Messages / notifications | Office-wide conversations and the notification centre. |
| Settings | Company profile, booking rules (lead time, advance window), business hours, session notice, announcement banner, privacy officer and retention period. |

### Surveyor / field staff portal (`/staff`)

- Personal dashboard and month/week/day/agenda schedule of assigned visits.
- Open a visit, start fieldwork and mark it complete (both actions require confirmation).
- Report a schedule conflict to the administrator, optionally linked to a booking.
- Assigned projects only, with the ability to advance permitted stages, add field notes and upload
  documents/revisions.
- Messages, notifications and profile.

Surveyors cannot open `/admin/*`, cannot list other clients' records, and cannot change a project's
release status or settings. The restriction is enforced by the API, not just the menu.

---

## Technology

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite 5, React Router 6, Recharts, PDF.js (`pdfjs-dist`) |
| Styling | Hand-written CSS design system (`client/src/styles.css`) â€” dark green, navy, white, light gray |
| Backend | Node.js 20+, Express 4, `mysql2`, Zod, `bcryptjs`, Multer 2 |
| Hardening | Helmet, `express-rate-limit`, `compression`, `cookie-parser` |
| Database | MariaDB 10.4+ / MySQL 8.0+, InnoDB, `utf8mb4` |
| Sessions | Server-side `sessions` table, HTTP-only cookie, hashed token |
| Build | Vite production build served by Express (single origin) |

No CSS framework, chart service, CDN, analytics or external API is required at runtime.

---

## Repository layout

```
surveying_website/
â”œâ”€ client/                       React + Vite single-page app
â”‚  â”œâ”€ src/
â”‚  â”‚  â”œâ”€ pages/public/           Landing, Login, Register, Privacy, 404
â”‚  â”‚  â”œâ”€ pages/client/           Client portal pages
â”‚  â”‚  â”œâ”€ pages/admin/            Administrator pages
â”‚  â”‚  â”œâ”€ pages/staff/            Surveyor pages
â”‚  â”‚  â”œâ”€ components/             Layout, UI kit, calendar, charts, PDF viewer,
â”‚  â”‚  â”‚                          shared appointment/project/document views
â”‚  â”‚  â”œâ”€ api.js  auth.jsx  hooks.js  utils.js  styles.css
â”‚  â”‚  â””â”€ App.jsx                 Route map
â”‚  â””â”€ dist/                      Production build (created by `npm run build`)
â”œâ”€ server/
â”‚  â”œâ”€ src/
â”‚  â”‚  â”œâ”€ index.js                Express app, API mounts, SPA serving
â”‚  â”‚  â”œâ”€ config.js               Environment configuration
â”‚  â”‚  â”œâ”€ routes/                 auth, public, dashboard, appointments, projects,
â”‚  â”‚  â”‚                          documents, blueprints, calendar, notifications,
â”‚  â”‚  â”‚                          messages, staff, admin, reports
â”‚  â”‚  â”œâ”€ middleware/             auth/RBAC, CSRF, upload, rate limits, errors
â”‚  â”‚  â””â”€ lib/                    DB helpers, slots, stages, files, audit, notify
â”‚  â”œâ”€ db/
â”‚  â”‚  â”œâ”€ schema.sql              24-table relational schema
â”‚  â”‚  â”œâ”€ migrate.js              Creates the schema (refuses to clobber)
â”‚  â”‚  â”œâ”€ seed.js                 Realistic demo data + demo PDFs
â”‚  â”‚  â””â”€ demo-pdf.js             Dependency-free PDF generator for seed files
â”‚  â”œâ”€ uploads/                   Private document/blueprint storage (git-ignored)
â”‚  â”œâ”€ .env.example               Configuration template
â”‚  â””â”€ package.json
â”œâ”€ package.json                  Root convenience scripts
â””â”€ README.md
```

---

## Getting started

### Prerequisites

- Node.js **20 or newer** (tested on Node 24) and npm.
- MySQL **8.0+** or MariaDB **10.4+**.
- A writable filesystem for `server/uploads/` (created automatically).

### 1. Install dependencies

From the project root:

```bash
npm run setup
```

This installs the root, server and client dependencies.

### 2. Create the database and application user

Connect as a database administrator and run:

```sql
CREATE DATABASE surveying_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'survey_app'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
CREATE USER 'survey_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON surveying_db.* TO 'survey_app'@'localhost';
GRANT ALL PRIVILEGES ON surveying_db.* TO 'survey_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

> Use the same password in `server/.env`. For production, consider granting only
> `SELECT, INSERT, UPDATE, DELETE` after the schema has been created.

### 3. Configure the server

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```

Edit `server/.env` and set at least:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=survey_app
DB_PASSWORD=replace-with-a-strong-password
DB_NAME=surveying_db
SESSION_SECRET=<long random value>
```

Generate a secret with `openssl rand -hex 48` (or any 48+ random bytes).

### 4. Create tables and demo data

```bash
npm run db:setup
```

Equivalent to:

```bash
npm run db:migrate --prefix server
npm run db:seed --prefix server
```

`db:migrate` refuses to run if the tables already exist. To rebuild from scratch:

```bash
npm run db:reset --prefix server   # DESTROYS app tables, then reseeds
```

### 5. Run in development

```bash
npm run dev
```

- Web app: <http://localhost:5174>
- API: <http://localhost:5000>
- Health probe: <http://localhost:5000/api/health>

Vite proxies `/api` to the Express server. Both processes run under `concurrently`.

### 6. Open it on a phone (same Wi-Fi)

`client/vite.config.js` listens on all interfaces and `server/.env` already allows this machine's
LAN origin, so a phone on the same network can use the app without extra software:

1. Find this computer's IPv4 address with `ipconfig` (on this machine it is **192.168.1.5**).
2. Make sure the phone is on the same Wi-Fi network.
3. Open **http://192.168.1.5:5174** in the phone browser and sign in normally.

If the page does not load, allow Node.js through Windows Defender Firewall for **Private**
networks (or allow inbound TCP ports `5174` and `5000`). If the computer's IP changes, add the new
origin to `CLIENT_ORIGIN` in `server/.env` (comma-separated) and restart the API.

This is for local testing only. On the public internet, deploy the production build behind HTTPS
and set `CLIENT_ORIGIN` to the real domain â€” never expose the Vite dev server directly.

```
ipconfig | findstr /i "IPv4"
```


### This machine's bundled database

The copy of the project on this machine is already configured in `server/.env` for a bundled
XAMPP MariaDB instance on port **3307**, with an isolated data directory:

```
C:\xampp\mysql\bin\mysqld.exe ^
  --defaults-file=C:\xampp\mysql\data_surveying\my.ini ^
  --datadir=C:\xampp\mysql\data_surveying ^
  --port=3307 --standalone --console
```

Start that process before `npm run dev`. Do **not** point the app at `C:\xampp\mysql\data`, which
is a separate/corrupted data directory on this machine. The database `surveying_db`, the user
`survey_app`, and all tables/demo rows are already present.

---

## Demo accounts

All demo accounts use the passwords below. The login page has a one-click demo panel with a
production warning; remove that panel and these accounts before going live.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@trompetasurveying.ph` | `Admin#2026` |
| Surveyor | `rafael.reyes@trompetasurveying.ph` | `Survey#2026` |
| Surveyor | `bianca.cruz@trompetasurveying.ph` | `Survey#2026` |
| Surveyor | `noel.bautista@trompetasurveying.ph` | `Survey#2026` |
| Client | `maria.santos@gmail.com` | `Client#2026` |
| Client | `juan.delacruz@gmail.com` | `Client#2026` |
| Client | `ana.reyes@gmail.com` | `Client#2026` |
| Client | `pedro.garcia@gmail.com` | `Client#2026` |
| Client | `liza.manalo@gmail.com` | `Client#2026` |

The seed also creates services, fee lines, document requirements, properties, appointments in
every status, projects at different stages, documents, blueprint versions, conversations,
inquiries, notifications and activity logs.

---

## Configuration reference

All server settings live in `server/.env` (see `.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables strict checks and production behaviour. |
| `PORT` | `5000` | API/HTTP port. |
| `CLIENT_ORIGIN` | `http://localhost:5174` | Allowed browser origin for CSRF checks; comma-separated list supported. In development the loopback twin (`127.0.0.1`) is also accepted. |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | Database location. |
| `DB_USER` / `DB_PASSWORD` | `survey_app` / â€” | Database credentials. |
| `DB_NAME` | `surveying_db` | Database name. |
| `DB_POOL_SIZE` | `10` | Connection pool size. |
| `SESSION_SECRET` | insecure dev value | Must be strong in production; the server refuses to start if it contains `development`. |
| `SESSION_TTL_HOURS` | `12` | Session lifetime. |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS. |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy so client IPs are correct. |
| `UPLOAD_DIR` | `./uploads` | Private storage root (relative to `server/`). |
| `MAX_DOCUMENT_MB` | `15` | Per-file document limit. |
| `MAX_BLUEPRINT_MB` | `60` | Per-file drawing limit. |
| `EMAIL_ENABLED` | `false` | Must remain `false` until a real transport is implemented. |
| `SMTP_*`, `MAIL_FROM` | empty | Reserved for a future email transport. |

Front-end configuration is compiled in; the app always calls same-origin `/api`, which Vite
proxies in development and Express serves in production.

---

## Production build

```bash
npm run build          # builds client/dist
npm start              # starts Express; serves API + SPA on PORT
```

Then open <http://localhost:5000>. Express serves hashed assets with immutable caching and falls
back to `index.html` for client-side routes.

For a real deployment:

1. Put Express behind HTTPS (nginx, Caddy, IIS ARR, or a PaaS router).
2. Set `NODE_ENV=production`, a strong `SESSION_SECRET`, `COOKIE_SECURE=true`, and
   `TRUST_PROXY=true` if a proxy terminates TLS.
3. Set `CLIENT_ORIGIN` to the public origin, e.g. `https://office.example.ph`.
4. Keep `server/uploads/` outside the web root (the default) and include it in backups.
5. Use a process supervisor (systemd, PM2, NSSM) and restrict database access to the app host.
6. Run the schema migration once, then remove or disable demo seeding in production.

The server refuses to start in production with a placeholder session secret. It will warn if
`client/dist` is missing.

---

## Data model

The schema (`server/db/schema.sql`) contains 24 InnoDB tables with foreign keys and
`created_at`/`updated_at` timestamps.

| Group | Tables |
| --- | --- |
| Identity | `users`, `client_profiles`, `staff_profiles`, `sessions` |
| Service catalogue | `services`, `service_fees`, `document_requirements` |
| Office configuration | `office_settings`, `business_hours` |
| Scheduling | `properties`, `appointments`, `surveying_schedules` |
| Project delivery | `survey_projects`, `project_assignments`, `project_status_history`, `field_notes` |
| Records | `property_documents`, `blueprints`, `blueprint_versions` |
| Communication | `notifications`, `conversations`, `messages`, `inquiries` |
| Governance | `activity_logs` |

Key relationships:

- A client has many properties, appointments, projects and documents.
- An approved appointment creates exactly one `survey_project` (1:1) and a fieldwork schedule.
- A project has stage history, assignments, field notes, documents and blueprints.
- A blueprint has many immutable versions; only versions marked `approved_for_release` are
  visible to the client.
- Files are stored on disk with randomized names; the database holds metadata and the storage
  reference only.

---

## Workflows and statuses

### Appointment lifecycle

```
pending â”€â”€approveâ”€â”€â–¶ approved â”€â”€confirmâ”€â”€â–¶ confirmed â”€â”€startâ”€â”€â–¶ in_progress â”€â”€completeâ”€â”€â–¶ completed
   â”‚                    â”‚                      â”‚
   â”œâ”€â”€rejectâ”€â”€â–¶ rejectedâ”‚                      â””â”€â”€cancelâ”€â”€â–¶ cancelled
   â””â”€â”€reschedule_requested â”€â”€resolveâ”€â”€â–¶ confirmed (new date/time)
```

- **Approve** requires an active surveyor and checks that neither the surveyor nor the client has
  an overlapping visit. It creates the project and a fieldwork schedule.
- **Confirm** notifies the client that the visit is final.
- **Reschedule** rechecks conflicts for the new slot.
- **Start / complete** are restricted to the assigned surveyor (and admins); both ask for
  confirmation in the UI.
- Only the office can reject or cancel; clients can request a change subject to policy.

### Project stages

`request_submitted â†’ initial_review â†’ documents_incomplete â†’ documents_under_review â†’
appointment_confirmed â†’ field_survey_scheduled â†’ field_survey_in_progress â†’ data_processing â†’
professional_review â†’ documents_ready â†’ completed` (plus `archived`).

Every change is written to `project_status_history` with the actor and note. Surveyors may only
move a project forward through field/document stages; administrators can correct any stage.

### Document review

`submitted â†’ under_review â†’ approved` or `rejected` (with mandatory notes). Re-uploading a
requirement supersedes the previous file and increments its version; history is retained.

### Blueprint release

`draft â†’ for_review â†’ approved_for_release â†’ archived`. Clients only see released revisions and
can only download released files. Releasing a revision sends an in-app notification.

---

## Security

- **Passwords:** bcrypt with cost factor 12; passwords are never logged or returned.
- **Sessions:** random 256-bit token stored only as a SHA-256 hash in `sessions`; the browser
  holds an HTTP-only, `SameSite=Lax` cookie (`trs_sid`), `Secure` when configured. Sessions expire,
  can be listed and revoked by the user, and are deleted on sign-out/password change.
- **CSRF:** double-submit cookie (`trs_csrf`, readable) plus `X-CSRF-Token` header, with an Origin
  allowlist for state-changing requests.
- **Authorization:** role middleware (`requireAuth`, `requireRole`, `requireStaff`, `requireAdmin`)
  plus per-record checks (`canAccessProject`) on every object route. Surveyors are restricted to
  assigned projects and their own schedule.
- **Input validation:** Zod schemas on every mutating endpoint and query parser; numeric coercion
  and length limits; centralized error responses that do not leak SQL or stack traces.
- **SQL injection:** parameterized statements throughout (`?` placeholders); identifiers used in
  dynamic ordering come from fixed allowlists.
- **XSS:** React escaping by default; no `dangerouslySetInnerHTML`; strict Helmet Content Security
  Policy (`script-src 'self'`, no inline scripts; inline styles only).
- **File uploads:** extension allowlist, MIME normalization, per-type and per-requirement size
  limits, randomized server filenames, private storage outside the static root, `nosniff`,
  `Content-Disposition`, and authenticated streaming with `Cache-Control: private, no-store`.
- **Throttling:** global API budget, tighter login (10 failed attempts/15 min), registration,
  upload and inquiry limits. Login responses are deliberately generic to avoid account
  enumeration, and bcrypt comparison runs even for unknown emails.
- **Audit trail:** sign-ins, bookings, decisions, stage changes, uploads, downloads, releases,
  settings changes and inquiry handling are written to `activity_logs` with actor, IP and
  user agent where available.
- **Headers:** Helmet CSP, frame-ancestors, referrer policy, no `X-Powered-By`, compression.
- **Browser storage:** no tokens in `localStorage`; the session lives in an HTTP-only cookie and
  CSRF token lives in a non-sensitive cookie.

Deployment hardening: terminate TLS, enable HSTS at the proxy, keep the database off the public
network, and back up both the database and `server/uploads/`.

---

## Privacy and the Data Privacy Act

The system is designed to support compliance with the Philippine **Data Privacy Act of 2012
(RA 10173)**; it is not a legal certification. Before production use, have the office's privacy
officer review the notice, retention period and access matrix.

Implemented safeguards:

- Privacy notice at `/privacy` and a mandatory consent checkbox on registration, booking and the
  inquiry form; acceptance time is stored (`privacy_accepted_at`).
- Configurable privacy officer name/email and document retention period in **Settings**.
- Role-based least privilege: clients see only their own records; surveyors see only assigned
  fieldwork; administrators see office-wide records.
- Private file storage and authenticated, audited downloads.
- Full activity log for access and changes, visible to administrators.
- No third-party analytics, trackers, advertising pixels or external CDNs; the app is fully
  self-hosted.
- Data minimization in API responses: clients never receive internal notes or unreleased files.
- Session revocation and password changes for compromised accounts.

Operational duties (outside the code): appoint a Data Protection Officer, publish a retention and
disposal schedule, obtain consent for any new purpose, log and investigate breaches, and provide
a documented process for data-subject access/correction requests.

---

## Features intentionally not enabled

These are deliberately **not** presented as working:

- **Email notifications** â€” `EMAIL_ENABLED=false`; `src/lib/mailer.js` throws if enabled without a
  transport. All notifications are in-app. The login page explicitly says automated password-reset
  email is not configured.
- **SMS notifications** â€” no gateway is integrated.
- **Automated password reset** â€” users contact the office; administrators can reset a staff
  password from **Staff**.
- **Online payments** â€” fees are estimates/quotes only. No payment gateway or receipting.
- **Automatic off-site backups** â€” back up MySQL and `server/uploads/` with your own schedule.
- **E-signatures / notarization** â€” documents are stored and reviewed, not legally signed.
- **GIS map / geocoding** â€” coordinates can be recorded, but the map action opens an external map
  link; there is no embedded mapping service.
- **Excel/PDF report exports** â€” reports export to CSV only (UTF-8 with BOM for Excel).
- **Two-factor authentication** â€” not implemented; use strong passwords and HTTPS.

If a feature above is required, wire it in explicitly and update the UI copy so the system never
claims a delivery or payment that did not happen.

---

## Verification performed

The delivered build was exercised against the running MariaDB instance:

- **Production build:** `npm run build` completes (React, Recharts and PDF.js split into chunks;
  PDF worker bundled).
- **API smoke suite â€” 48 checks:** health, public catalogue/office, all three sign-ins, every
  role's list endpoints, client detail, notes update/revert, CSV export, CSRF enforcement,
  notification read, staff conflict report, settings round-trip, and role-block checks
  (surveyor â†’ admin 403, client â†’ reports 403).
- **End-to-end workflow â€” 18 checks:** client booking with availability â†’ admin approve
  (auto-creates project) â†’ confirm â†’ surveyor start â†’ complete â†’ stage change â†’ client document
  upload â†’ admin document approval â†’ client sees project/document â†’ assigned surveyor access â†’
  other client blocked (403) â†’ surveyor blocked from admin.
- **Blueprint security â€” 14 checks:** surveyor upload, client blocked before release, admin
  release, client list/detail/file/download, private/no-store headers, other-client blocked from
  metadata and file, revision upload, client sees only released revisions, second release.
- **Secondary workflows â€” 22 checks:** client reschedule and cancel rules, admin resolve/reject/
  reschedule decisions, messaging (including blocked replies on closed threads), service
  create/update/deactivate, staff create/edit/password reset, and blueprint archive.
- **Negative validation:** registration rejects weak passwords, missing consent and duplicate
  emails; the public inquiry form rejects honeypot submissions.
- **Production config guard:** booting with `NODE_ENV=production` and a short or placeholder
  `SESSION_SECRET` aborts immediately; a 48-character random secret starts normally.
- **Browser sweep â€” 68 page renders:** every public, client, admin and surveyor route at 1440 px
  and 390 px, with no console errors, failed API calls, empty screens or horizontal overflow.
- **Interaction checks:** staff/service/appointment/project dialogs open and close, client booking
  wizard advances, staff conflict modal, start-visit and confirm-booking confirmations.
- **PDF viewer:** seeded PDF renders to canvas, toolbar/zoom work, no worker or CSP errors.

Reproduce after setup:

```bash
npm run build
npm run db:reset --prefix server
npm run dev
```

Then walk the three demo roles through the workflows above.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `ECONNREFUSED` on startup | Is MySQL/MariaDB running? Is `DB_PORT` correct? On this machine the bundled instance listens on **3307**. |
| `ER_ACCESS_DENIED_ERROR` | `DB_USER`/`DB_PASSWORD` in `server/.env`; the user must be granted access from the connecting host. |
| `Unknown database 'surveying_db'` | Create the database (step 2) before running `db:migrate`. |
| Migration refuses to run | Tables exist. Use `npm run db:reset --prefix server` only when you intend to erase data. |
| Login says â€œRequest origin is not allowedâ€ | Open the app through the origin in `CLIENT_ORIGIN`. Localhost and 127.0.0.1 are both accepted in development. |
| 429 â€œToo many requestsâ€ | Wait for the window to reset; check proxies so client IPs are not merged, and review limits in `server/src/middleware/rateLimit.js`. |
| Upload rejected | Check the extension allowlist, `MAX_DOCUMENT_MB` / `MAX_BLUEPRINT_MB`, and the requirement's own limits. |
| PDF viewer stays blank | Confirm `/assets/pdf.worker.min-*.mjs` is served, the browser allows workers, and the file is a valid PDF. |
| Plans missing for a client | Only versions with status `approved_for_release` are visible; release from **Admin â†’ Survey Plans**. |
| Time appears off by hours | The app uses Asia/Manila (`+08:00`) for date logic; keep the server clock correct and leave the schema's `SET time_zone` intact. |
| `client/dist` warning in production | Run `npm run build` before `npm start`. |

---

## Go-live checklist

- [ ] Replace/remove all demo accounts and the demo panel on the login page.
- [ ] Change every seeded password; ensure the `admin` account has a unique strong password.
- [ ] Set `NODE_ENV=production`, a strong random `SESSION_SECRET`, `COOKIE_SECURE=true`.
- [ ] Serve over HTTPS and enable HSTS at the proxy.
- [ ] Set `CLIENT_ORIGIN` (and `TRUST_PROXY`) correctly.
- [ ] Use a dedicated, least-privilege database user; restrict network access.
- [ ] Configure and test backups for MySQL **and** `server/uploads/`.
- [ ] Review business hours, booking lead time, advance window, session notice and announcement.
- [ ] Confirm privacy officer, retention period and the `/privacy` text with the office.
- [ ] Decide whether to implement email/SMS; until then keep `EMAIL_ENABLED=false` and the UI copy
      accurate.
- [ ] Review rate limits for the office's shared IP.
- [ ] Keep `server/uploads/` out of the web root and out of version control.
- [ ] Re-run the build, smoke test and one full booking workflow on the production host.

---

*Demo content (company, people, properties, fees and drawings) is fictional and intended for
evaluation. Replace it with the office's real records before use.*

