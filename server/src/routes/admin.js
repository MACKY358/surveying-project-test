'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const { query, one, transaction, tquery } = require('../db');
const { asyncHandler, badRequest, notFound, forbidden } = require('../lib/errors');
const {
  parse,
  pagination,
  optionalText,
  email,
  password,
  phone,
  trimmed,
  isoDate,
  timeOfDay,
  likeTerm,
  orderBy,
} = require('../lib/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notifyUsers, notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { pageMeta, initials } = require('../lib/format');
const { getSettings, setSettings, getBusinessHours, setBusinessHours, DEFAULTS } = require('../lib/settings');
const { stageLabel } = require('../lib/stages');
const { humanSize } = require('../lib/files');

const router = express.Router();
router.use(requireAuth, requireAdmin);

/* ------------------------------------------------------------------ */
/* Clients                                                            */
/* ------------------------------------------------------------------ */
router.get(
  '/clients',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, sort, dir } = parse(pagination, req.query);
    const status = req.query.status ? String(req.query.status) : '';

    const where = [`u.role = 'client'`, 'u.deleted_at IS NULL'];
    const params = [];
    if (q) {
      const term = likeTerm(q);
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR cp.city_municipality LIKE ?)');
      params.push(term, term, term, term);
    }
    if (status === 'active') where.push('u.is_active = 1');
    if (status === 'inactive') where.push('u.is_active = 0');

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const base = `FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id ${whereSql}`;
    const total = Number((await one(`SELECT COUNT(*) AS total ${base}`, params)).total);
    const order = orderBy(sort, dir, { name: 'u.full_name', created: 'u.created_at' }, 'u.created_at');

    const rows = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at, u.last_login_at,
              cp.city_municipality, cp.province, cp.client_type, cp.company_name,
              (SELECT COUNT(*) FROM appointments a WHERE a.client_id = u.id) AS appointments,
              (SELECT COUNT(*) FROM survey_projects p WHERE p.client_id = u.id) AS projects,
              (SELECT COUNT(*) FROM property_documents d WHERE d.client_id = u.id AND d.deleted_at IS NULL) AS documents
       ${base} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );

    res.json({
      clients: rows.map((c) => ({
        id: c.id,
        fullName: c.full_name,
        initials: initials(c.full_name),
        email: c.email,
        phone: c.phone,
        isActive: !!c.is_active,
        createdAt: c.created_at,
        lastLoginAt: c.last_login_at,
        cityMunicipality: c.city_municipality,
        province: c.province,
        clientType: c.client_type,
        companyName: c.company_name,
        counts: {
          appointments: Number(c.appointments),
          projects: Number(c.projects),
          documents: Number(c.documents),
        },
      })),
      meta: pageMeta({ page, pageSize, total }),
    });
  }),
);

router.get(
  '/clients/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const client = await one(
      `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at, u.last_login_at,
              u.privacy_accepted_at, cp.address_line, cp.barangay, cp.city_municipality, cp.province,
              cp.postal_code, cp.valid_id_type, cp.valid_id_number, cp.client_type, cp.company_name, cp.notes
         FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
        WHERE u.id = ? AND u.role = 'client' AND u.deleted_at IS NULL`,
      [id],
    );
    if (!client) throw notFound('Client not found.');

    const appointments = await query(
      `SELECT a.id, a.reference_no, a.status, a.preferred_date, a.preferred_time, a.fee_estimate,
              s.name AS service_name, sv.full_name AS surveyor_name
         FROM appointments a JOIN services s ON s.id = a.service_id
         LEFT JOIN users sv ON sv.id = a.assigned_surveyor_id
        WHERE a.client_id = ? ORDER BY a.preferred_date DESC LIMIT 25`,
      [id],
    );
    const projects = await query(
      `SELECT p.id, p.project_no, p.stage, p.progress_percent, p.archived_at, s.name AS service_name
         FROM survey_projects p JOIN services s ON s.id = p.service_id
        WHERE p.client_id = ? ORDER BY p.updated_at DESC LIMIT 25`,
      [id],
    );
    const properties = await query(
      `SELECT id, lot_no, barangay, city_municipality, province, area_sqm, title_no, created_at
         FROM properties WHERE client_id = ? ORDER BY created_at DESC`,
      [id],
    );
    const documents = await query(
      `SELECT id, title, category, original_name, status, version, size_bytes, created_at
         FROM property_documents WHERE client_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 30`,
      [id],
    );

    res.json({
      client: {
        id: client.id,
        fullName: client.full_name,
        email: client.email,
        phone: client.phone,
        isActive: !!client.is_active,
        createdAt: client.created_at,
        lastLoginAt: client.last_login_at,
        privacyAcceptedAt: client.privacy_accepted_at,
        profile: {
          addressLine: client.address_line,
          barangay: client.barangay,
          cityMunicipality: client.city_municipality,
          province: client.province,
          postalCode: client.postal_code,
          validIdType: client.valid_id_type,
          validIdNumber: client.valid_id_number,
          clientType: client.client_type,
          companyName: client.company_name,
          notes: client.notes,
        },
      },
      appointments: appointments.map((a) => ({
        id: a.id,
        referenceNo: a.reference_no,
        status: a.status,
        date: a.preferred_date,
        time: a.preferred_time,
        serviceName: a.service_name,
        surveyorName: a.surveyor_name,
        fee: a.fee_estimate === null ? null : Number(a.fee_estimate),
      })),
      projects: projects.map((p) => ({
        id: p.id,
        projectNo: p.project_no,
        stage: p.stage,
        stageLabel: stageLabel(p.stage),
        progressPercent: p.progress_percent,
        archived: !!p.archived_at,
        serviceName: p.service_name,
      })),
      properties,
      documents: documents.map((d) => ({
        ...d,
        sizeBytes: Number(d.size_bytes),
        size: humanSize(d.size_bytes),
      })),
    });
  }),
);

const clientPatchSchema = z.object({
  isActive: z.boolean().optional(),
  notes: optionalText(2000),
  fullName: trimmed(150, 'Full name').optional(),
  phone,
  addressLine: optionalText(255),
  barangay: optionalText(120),
  cityMunicipality: optionalText(120),
  province: optionalText(120),
  validIdType: optionalText(80),
  validIdNumber: optionalText(80),
});

router.patch(
  '/clients/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(clientPatchSchema, req.body);
    const client = await one(`SELECT * FROM users WHERE id = ? AND role = 'client' AND deleted_at IS NULL`, [id]);
    if (!client) throw notFound('Client not found.');

    // Only touch profile rows when the request actually carries profile fields,
    // so toggling `isActive` alone never wipes saved addresses or IDs.
    const hasProfileFields = [
      'addressLine',
      'barangay',
      'cityMunicipality',
      'province',
      'validIdType',
      'validIdNumber',
      'notes',
    ].some((key) => data[key] !== undefined);

    await transaction(async (conn) => {
      if (data.isActive !== undefined || data.fullName || data.phone !== undefined) {
        await tquery(conn, 'UPDATE users SET is_active = COALESCE(?, is_active), full_name = COALESCE(?, full_name), phone = ? WHERE id = ?', [
          data.isActive === undefined ? null : data.isActive ? 1 : 0,
          data.fullName || null,
          data.phone ?? client.phone,
          id,
        ]);
      }
      if (data.isActive === false) {
        await tquery(conn, 'DELETE FROM sessions WHERE user_id = ?', [id]);
      }
      if (hasProfileFields) {
        await tquery(
          conn,
          `INSERT INTO client_profiles (user_id, address_line, barangay, city_municipality, province, valid_id_type, valid_id_number, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE address_line = VALUES(address_line), barangay = VALUES(barangay),
             city_municipality = VALUES(city_municipality), province = VALUES(province),
             valid_id_type = VALUES(valid_id_type), valid_id_number = VALUES(valid_id_number), notes = VALUES(notes)`,
          [
            id,
            data.addressLine,
            data.barangay,
            data.cityMunicipality,
            data.province,
            data.validIdType,
            data.validIdNumber,
            data.notes,
          ],
        );
      }
    });

    await audit(req, 'client.update', `Updated client account #${id}`, { entityType: 'user', entityId: id });
    res.json({ ok: true, message: 'Client account updated.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Staff management                                                   */
/* ------------------------------------------------------------------ */
router.get(
  '/staff',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at, u.last_login_at,
              sp.employee_no, sp.position, sp.license_no, sp.specialization, sp.max_daily_projects, sp.hire_date,
              (SELECT COUNT(*) FROM appointments a WHERE a.assigned_surveyor_id = u.id
                AND a.status IN ('approved','confirmed','in_progress')) AS active_load,
              (SELECT COUNT(*) FROM survey_projects p WHERE p.lead_surveyor_id = u.id AND p.archived_at IS NULL) AS lead_projects
         FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id
        WHERE u.role IN ('surveyor','admin') AND u.deleted_at IS NULL
        ORDER BY u.role, u.full_name`,
    );
    res.json({
      staff: rows.map((s) => ({
        id: s.id,
        fullName: s.full_name,
        initials: initials(s.full_name),
        email: s.email,
        phone: s.phone,
        role: s.role,
        isActive: !!s.is_active,
        createdAt: s.created_at,
        lastLoginAt: s.last_login_at,
        employeeNo: s.employee_no,
        position: s.position,
        licenseNo: s.license_no,
        specialization: s.specialization,
        maxDailyProjects: s.max_daily_projects,
        hireDate: s.hire_date,
        activeLoad: Number(s.active_load),
        leadProjects: Number(s.lead_projects),
      })),
    });
  }),
);

const staffCreateSchema = z.object({
  fullName: trimmed(150, 'Full name'),
  email,
  password,
  phone,
  role: z.enum(['surveyor', 'admin']),
  employeeNo: optionalText(30),
  position: optionalText(100),
  licenseNo: optionalText(60),
  specialization: optionalText(160),
  maxDailyProjects: z.coerce.number().int().min(1).max(20).optional(),
  hireDate: isoDate.optional().nullable(),
});

router.post(
  '/staff',
  asyncHandler(async (req, res) => {
    const data = parse(staffCreateSchema, req.body);
    if (await one('SELECT id FROM users WHERE email = ?', [data.email])) {
      throw badRequest('An account with that email already exists.', { email: 'Already registered.' });
    }

    const hash = await bcrypt.hash(data.password, 12);
    const id = await transaction(async (conn) => {
      const ins = await conn.execute(
        `INSERT INTO users (role, email, password_hash, full_name, phone, must_change_password) VALUES (?, ?, ?, ?, ?, 1)`,
        [data.role, data.email, hash, data.fullName, data.phone],
      );
      const userId = ins[0].insertId;
      await conn.execute(
        `INSERT INTO staff_profiles (user_id, employee_no, position, license_no, specialization, max_daily_projects, hire_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          data.employeeNo,
          data.position,
          data.licenseNo,
          data.specialization,
          data.maxDailyProjects || 3,
          data.hireDate || null,
        ],
      );
      return userId;
    });

    await notifyUsers(id, {
      type: 'account',
      title: 'Welcome to the team',
      message: 'Your staff account has been created. Please change your password after signing in.',
      link: '/app/profile',
    });
    await audit(req, 'staff.create', `Created ${data.role} account for ${data.email}`, {
      entityType: 'user',
      entityId: id,
    });
    res.status(201).json({ ok: true, id, message: 'Staff account created. Share the temporary password securely.' });
  }),
);

const staffPatchSchema = z.object({
  fullName: trimmed(150, 'Full name').optional(),
  phone,
  role: z.enum(['surveyor', 'admin']).optional(),
  isActive: z.boolean().optional(),
  employeeNo: optionalText(30),
  position: optionalText(100),
  licenseNo: optionalText(60),
  specialization: optionalText(160),
  maxDailyProjects: z.coerce.number().int().min(1).max(20).optional(),
  hireDate: isoDate.optional().nullable(),
});

router.patch(
  '/staff/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(staffPatchSchema, req.body);
    const staff = await one(`SELECT * FROM users WHERE id = ? AND role IN ('surveyor','admin') AND deleted_at IS NULL`, [id]);
    if (!staff) throw notFound('Staff account not found.');

    if (data.role === 'surveyor' && staff.role === 'admin') {
      const admins = Number(
        (await one(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND deleted_at IS NULL`)).c,
      );
      if (admins <= 1) throw badRequest('You cannot demote the only administrator account.');
    }

    const hasProfileFields = ['employeeNo', 'position', 'licenseNo', 'specialization', 'maxDailyProjects', 'hireDate'].some(
      (key) => data[key] !== undefined,
    );

    await transaction(async (conn) => {
      await tquery(
        conn,
        `UPDATE users SET full_name = COALESCE(?, full_name), phone = ?, role = COALESCE(?, role),
            is_active = COALESCE(?, is_active) WHERE id = ?`,
        [data.fullName || null, data.phone ?? staff.phone, data.role || null, data.isActive === undefined ? null : data.isActive ? 1 : 0, id],
      );
      if (data.isActive === false) {
        await tquery(conn, 'DELETE FROM sessions WHERE user_id = ?', [id]);
      }
      if (hasProfileFields) {
        const profile = await tquery(conn, 'SELECT user_id FROM staff_profiles WHERE user_id = ?', [id]);
        const columns = {
          employeeNo: 'employee_no',
          position: 'position',
          licenseNo: 'license_no',
          specialization: 'specialization',
          maxDailyProjects: 'max_daily_projects',
          hireDate: 'hire_date',
        };

        if (profile.length) {
          // Update only the fields the caller actually sent. This keeps a
          // partial edit from overwriting unrelated profile values.
          const sets = [];
          const params = [];
          for (const [key, column] of Object.entries(columns)) {
            if (data[key] !== undefined) {
              sets.push(`${column} = ?`);
              params.push(data[key]);
            }
          }
          if (sets.length) {
            await tquery(conn, `UPDATE staff_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...params, id]);
          }
        } else {
          await tquery(
            conn,
            `INSERT INTO staff_profiles (user_id, employee_no, position, license_no, specialization, max_daily_projects, hire_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              data.employeeNo ?? null,
              data.position ?? null,
              data.licenseNo ?? null,
              data.specialization ?? null,
              data.maxDailyProjects ?? 3,
              data.hireDate ?? null,
            ],
          );
        }
      }
    });

    await audit(req, 'staff.update', `Updated staff account #${id}`, { entityType: 'user', entityId: id });
    res.json({ ok: true, message: 'Staff account updated.' });
  }),
);

router.post(
  '/staff/:id/reset-password',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const user = await one('SELECT id, full_name, role FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!user) throw notFound('Account not found.');

    const temp = `Tmp-${crypto.randomBytes(6).toString('base64url')}`;
    const hash = await bcrypt.hash(temp, 12);
    await query('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?', [
      hash,
      id,
    ]);
    await query('DELETE FROM sessions WHERE user_id = ?', [id]);
    await audit(req, 'user.password_reset', `Password reset for ${user.full_name} (${user.role})`, {
      entityType: 'user',
      entityId: id,
    });
    res.json({
      ok: true,
      temporaryPassword: temp,
      message: 'Temporary password generated. It is shown only once — share it securely.',
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Services & fees                                                    */
/* ------------------------------------------------------------------ */
router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM document_requirements dr WHERE dr.service_id = s.id AND dr.is_active = 1) AS requirement_count,
              (SELECT COUNT(*) FROM appointments a WHERE a.service_id = s.id) AS booking_count
         FROM services s ORDER BY s.sort_order, s.name`,
    );
    res.json({
      services: rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        shortName: s.short_name,
        description: s.description,
        category: s.category,
        baseFee: Number(s.base_fee),
        durationMinutes: s.duration_minutes,
        requiresFieldwork: !!s.requires_fieldwork,
        turnaroundDays: s.turnaround_days,
        isActive: !!s.is_active,
        sortOrder: s.sort_order,
        requirementCount: Number(s.requirement_count),
        bookingCount: Number(s.booking_count),
      })),
    });
  }),
);

const serviceSchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/i, 'Use letters, numbers, dash or underscore.'),
  name: trimmed(150, 'Name'),
  shortName: optionalText(60),
  description: optionalText(2000),
  category: z.enum(['survey', 'documentation', 'consultation']),
  baseFee: z.coerce.number().min(0).max(99999999),
  durationMinutes: z.coerce.number().int().min(30).max(600),
  requiresFieldwork: z.coerce.boolean().optional(),
  turnaroundDays: z.coerce.number().int().min(1).max(365).optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

router.post(
  '/services',
  asyncHandler(async (req, res) => {
    const data = parse(serviceSchema, req.body);
    if (await one('SELECT id FROM services WHERE code = ?', [data.code])) {
      throw badRequest('That service code is already in use.', { code: 'Duplicate code.' });
    }
    const result = await query(
      `INSERT INTO services (code, name, short_name, description, category, base_fee, duration_minutes,
          requires_fieldwork, turnaround_days, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.code.toUpperCase(),
        data.name,
        data.shortName,
        data.description,
        data.category,
        data.baseFee,
        data.durationMinutes,
        data.requiresFieldwork === false ? 0 : 1,
        data.turnaroundDays || 14,
        data.isActive === false ? 0 : 1,
        data.sortOrder || 0,
      ],
    );
    await audit(req, 'service.create', `Created service ${data.name}`, { entityType: 'service', entityId: result.insertId });
    res.status(201).json({ ok: true, id: result.insertId, message: 'Service created.' });
  }),
);

router.patch(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(serviceSchema.partial(), req.body);
    const existing = await one('SELECT * FROM services WHERE id = ?', [id]);
    if (!existing) throw notFound('Service not found.');

    await query(
      `UPDATE services SET code = ?, name = ?, short_name = ?, description = ?, category = ?, base_fee = ?,
          duration_minutes = ?, requires_fieldwork = ?, turnaround_days = ?, is_active = ?, sort_order = ?
        WHERE id = ?`,
      [
        (data.code || existing.code).toUpperCase(),
        data.name || existing.name,
        data.shortName ?? existing.short_name,
        data.description ?? existing.description,
        data.category || existing.category,
        data.baseFee ?? existing.base_fee,
        data.durationMinutes ?? existing.duration_minutes,
        data.requiresFieldwork === undefined ? existing.requires_fieldwork : data.requiresFieldwork ? 1 : 0,
        data.turnaroundDays ?? existing.turnaround_days,
        data.isActive === undefined ? existing.is_active : data.isActive ? 1 : 0,
        data.sortOrder ?? existing.sort_order,
        id,
      ],
    );
    await audit(req, 'service.update', `Updated service #${id}`, { entityType: 'service', entityId: id });
    res.json({ ok: true, message: 'Service updated.' });
  }),
);

router.get(
  '/service-fees',
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.query.serviceId) || null;
    const rows = await query(
      `SELECT f.*, s.name AS service_name FROM service_fees f
         JOIN services s ON s.id = f.service_id
        ${serviceId ? 'WHERE f.service_id = ?' : ''}
        ORDER BY s.sort_order, f.name`,
      serviceId ? [serviceId] : [],
    );
    res.json({
      fees: rows.map((f) => ({
        id: f.id,
        serviceId: f.service_id,
        serviceName: f.service_name,
        name: f.name,
        description: f.description,
        amount: Number(f.amount),
        isOptional: !!f.is_optional,
        isActive: !!f.is_active,
        effectiveFrom: f.effective_from,
      })),
    });
  }),
);

const feeSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  name: trimmed(150, 'Fee name'),
  description: optionalText(255),
  amount: z.coerce.number().min(0).max(99999999),
  isOptional: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  effectiveFrom: isoDate.optional().nullable(),
});

router.post(
  '/service-fees',
  asyncHandler(async (req, res) => {
    const data = parse(feeSchema, req.body);
    const result = await query(
      `INSERT INTO service_fees (service_id, name, description, amount, is_optional, is_active, effective_from)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.serviceId, data.name, data.description, data.amount, data.isOptional === false ? 0 : 1, data.isActive === false ? 0 : 1, data.effectiveFrom || null],
    );
    await audit(req, 'fee.create', `Created fee "${data.name}"`, { entityType: 'service_fee', entityId: result.insertId });
    res.status(201).json({ ok: true, id: result.insertId, message: 'Fee added.' });
  }),
);

router.patch(
  '/service-fees/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(feeSchema.partial(), req.body);
    const existing = await one('SELECT * FROM service_fees WHERE id = ?', [id]);
    if (!existing) throw notFound('Fee not found.');
    await query(
      `UPDATE service_fees SET name = ?, description = ?, amount = ?, is_optional = ?, is_active = ?, effective_from = ?
        WHERE id = ?`,
      [
        data.name || existing.name,
        data.description ?? existing.description,
        data.amount ?? existing.amount,
        data.isOptional === undefined ? existing.is_optional : data.isOptional ? 1 : 0,
        data.isActive === undefined ? existing.is_active : data.isActive ? 1 : 0,
        data.effectiveFrom ?? existing.effective_from,
        id,
      ],
    );
    await audit(req, 'fee.update', `Updated fee #${id}`, { entityType: 'service_fee', entityId: id });
    res.json({ ok: true, message: 'Fee updated.' });
  }),
);

router.delete(
  '/service-fees/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM service_fees WHERE id = ?', [id]);
    if (!existing) throw notFound('Fee not found.');
    await query('UPDATE service_fees SET is_active = 0 WHERE id = ?', [id]);
    await audit(req, 'fee.archive', `Archived fee #${id}`, { entityType: 'service_fee', entityId: id });
    res.json({ ok: true, message: 'Fee archived (historical quotes are preserved).' });
  }),
);

/* ------------------------------------------------------------------ */
/* Document requirements                                              */
/* ------------------------------------------------------------------ */
router.get(
  '/document-requirements',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT dr.*, s.name AS service_name FROM document_requirements dr
         LEFT JOIN services s ON s.id = dr.service_id
        ORDER BY s.name, dr.sort_order, dr.id`,
    );
    res.json({
      requirements: rows.map((r) => ({
        id: r.id,
        serviceId: r.service_id,
        serviceName: r.service_name || 'All services',
        code: r.code,
        name: r.name,
        description: r.description,
        isRequired: !!r.is_required,
        allowedTypes: r.allowed_types,
        maxSizeMb: r.max_size_mb,
        sortOrder: r.sort_order,
        isActive: !!r.is_active,
      })),
    });
  }),
);

const requirementSchema = z.object({
  serviceId: z.coerce.number().int().positive().optional().nullable(),
  code: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_-]+$/i, 'Use letters, numbers, dash or underscore.'),
  name: trimmed(160, 'Name'),
  description: optionalText(500),
  isRequired: z.coerce.boolean().optional(),
  allowedTypes: z.string().trim().max(160).optional(),
  maxSizeMb: z.coerce.number().int().min(1).max(60).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.coerce.boolean().optional(),
});

router.post(
  '/document-requirements',
  asyncHandler(async (req, res) => {
    const data = parse(requirementSchema, req.body);
    const result = await query(
      `INSERT INTO document_requirements (service_id, code, name, description, is_required, allowed_types, max_size_mb, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.serviceId || null,
        data.code.toUpperCase(),
        data.name,
        data.description,
        data.isRequired === false ? 0 : 1,
        data.allowedTypes || 'pdf,jpg,jpeg,png',
        data.maxSizeMb || 15,
        data.sortOrder || 0,
        data.isActive === false ? 0 : 1,
      ],
    );
    await audit(req, 'requirement.create', `Created document requirement ${data.code}`, {
      entityType: 'document_requirement',
      entityId: result.insertId,
    });
    res.status(201).json({ ok: true, id: result.insertId, message: 'Requirement created.' });
  }),
);

router.patch(
  '/document-requirements/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(requirementSchema.partial(), req.body);
    const existing = await one('SELECT * FROM document_requirements WHERE id = ?', [id]);
    if (!existing) throw notFound('Requirement not found.');
    await query(
      `UPDATE document_requirements SET service_id = ?, code = ?, name = ?, description = ?,
          is_required = ?, allowed_types = ?, max_size_mb = ?, sort_order = ?, is_active = ? WHERE id = ?`,
      [
        data.serviceId === undefined ? existing.service_id : data.serviceId,
        (data.code || existing.code).toUpperCase(),
        data.name || existing.name,
        data.description ?? existing.description,
        data.isRequired === undefined ? existing.is_required : data.isRequired ? 1 : 0,
        data.allowedTypes || existing.allowed_types,
        data.maxSizeMb || existing.max_size_mb,
        data.sortOrder ?? existing.sort_order,
        data.isActive === undefined ? existing.is_active : data.isActive ? 1 : 0,
        id,
      ],
    );
    await audit(req, 'requirement.update', `Updated document requirement #${id}`, {
      entityType: 'document_requirement',
      entityId: id,
    });
    res.json({ ok: true, message: 'Requirement updated.' });
  }),
);

router.delete(
  '/document-requirements/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM document_requirements WHERE id = ?', [id]);
    if (!existing) throw notFound('Requirement not found.');
    await query('UPDATE document_requirements SET is_active = 0 WHERE id = ?', [id]);
    await audit(req, 'requirement.archive', `Archived document requirement #${id}`, {
      entityType: 'document_requirement',
      entityId: id,
    });
    res.json({ ok: true, message: 'Requirement archived.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Office settings & business hours                                   */
/* ------------------------------------------------------------------ */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json({ settings: await getSettings(), defaults: DEFAULTS, businessHours: await getBusinessHours() });
  }),
);

const settingsSchema = z.record(z.string(), z.union([z.string(), z.null()])).refine((obj) => Object.keys(obj).length > 0, {
  message: 'No settings provided.',
});

router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const data = parse(settingsSchema, req.body);
    const allowed = new Set(Object.keys(DEFAULTS));
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      if (!allowed.has(key)) continue;
      clean[key] = value === null ? null : String(value).slice(0, 2000);
    }
    await setSettings(clean, req.user.id);
    await audit(req, 'settings.update', `Updated ${Object.keys(clean).length} office setting(s)`);
    res.json({ ok: true, settings: await getSettings(), message: 'Office settings saved.' });
  }),
);

const hoursSchema = z.array(
  z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    openTime: timeOfDay,
    closeTime: timeOfDay,
    breakStart: timeOfDay.optional().nullable(),
    breakEnd: timeOfDay.optional().nullable(),
    isClosed: z.coerce.boolean().optional(),
    slotMinutes: z.coerce.number().int().min(15).max(240).optional(),
  }),
);

router.put(
  '/business-hours',
  asyncHandler(async (req, res) => {
    const rows = parse(hoursSchema, req.body);
    await setBusinessHours(rows, req.user.id);
    await audit(req, 'settings.hours', 'Updated business hours');
    res.json({ ok: true, businessHours: await getBusinessHours(), message: 'Business hours saved.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Announcements                                                      */
/* ------------------------------------------------------------------ */
const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Enter a title.').max(180),
  message: z.string().trim().min(3, 'Write the announcement.').max(500),
  audience: z.enum(['all', 'clients', 'staff']).default('all'),
  link: optionalText(255),
});

router.post(
  '/announcements',
  asyncHandler(async (req, res) => {
    const data = parse(announcementSchema, req.body);
    const roles =
      data.audience === 'clients' ? ['client'] : data.audience === 'staff' ? ['surveyor', 'admin'] : ['client', 'surveyor', 'admin'];
    const users = await query(
      `SELECT id FROM users WHERE is_active = 1 AND deleted_at IS NULL AND role IN (${roles.map(() => '?').join(',')})`,
      roles,
    );
    await notifyUsers(users.map((u) => u.id), {
      type: 'announcement',
      title: data.title,
      message: data.message,
      link: data.link || null,
    });
    await audit(req, 'announcement.send', `Announcement sent to ${data.audience}: ${data.title}`);
    res.status(201).json({ ok: true, recipients: users.length, message: `Announcement sent to ${users.length} account(s).` });
  }),
);

/* ------------------------------------------------------------------ */
/* Inquiries                                                          */
/* ------------------------------------------------------------------ */
router.get(
  '/inquiries',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q } = parse(pagination, req.query);
    const status = req.query.status ? String(req.query.status) : '';
    const where = ['1 = 1'];
    const params = [];
    if (status && status !== 'all') {
      where.push('i.status = ?');
      params.push(status);
    }
    if (q) {
      const term = likeTerm(q);
      where.push('(i.name LIKE ? OR i.email LIKE ? OR i.subject LIKE ?)');
      params.push(term, term, term);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number((await one(`SELECT COUNT(*) AS total FROM inquiries i ${whereSql}`, params)).total);
    const rows = await query(
      `SELECT i.*, u.full_name AS handled_by_name FROM inquiries i
         LEFT JOIN users u ON u.id = i.handled_by
        ${whereSql} ORDER BY i.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    res.json({
      inquiries: rows.map((i) => ({
        id: i.id,
        name: i.name,
        email: i.email,
        phone: i.phone,
        subject: i.subject,
        message: i.message,
        status: i.status,
        handledBy: i.handled_by_name,
        createdAt: i.created_at,
      })),
      meta: pageMeta({ page, pageSize, total }),
    });
  }),
);

router.patch(
  '/inquiries/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = parse(z.object({ status: z.enum(['new', 'read', 'responded', 'closed']) }), req.body);
    const existing = await one('SELECT * FROM inquiries WHERE id = ?', [id]);
    if (!existing) throw notFound('Inquiry not found.');
    await query('UPDATE inquiries SET status = ?, handled_by = ? WHERE id = ?', [data.status, req.user.id, id]);
    await audit(req, 'inquiry.update', `Inquiry #${id} marked ${data.status}`, { entityType: 'inquiry', entityId: id });
    res.json({ ok: true, message: 'Inquiry updated.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Activity log                                                       */
/* ------------------------------------------------------------------ */
router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q } = parse(pagination, req.query);
    const action = req.query.action ? String(req.query.action) : '';
    const from = req.query.from ? String(req.query.from) : '';
    const to = req.query.to ? String(req.query.to) : '';

    const where = ['1 = 1'];
    const params = [];
    if (q) {
      const term = likeTerm(q);
      where.push('(l.description LIKE ? OR u.full_name LIKE ? OR l.action LIKE ?)');
      params.push(term, term, term);
    }
    if (action && action !== 'all') {
      where.push('l.action LIKE ?');
      params.push(`${action}%`);
    }
    if (from) {
      where.push('DATE(l.created_at) >= ?');
      params.push(from);
    }
    if (to) {
      where.push('DATE(l.created_at) <= ?');
      params.push(to);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const base = `FROM activity_logs l LEFT JOIN users u ON u.id = l.actor_id ${whereSql}`;
    const total = Number((await one(`SELECT COUNT(*) AS total ${base}`, params)).total);
    const rows = await query(
      `SELECT l.*, u.full_name AS actor_name ${base} ORDER BY l.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );

    res.json({
      logs: rows.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        description: l.description,
        actor: l.actor_name || 'System',
        actorRole: l.actor_role,
        ip: l.ip_address,
        createdAt: l.created_at,
      })),
      meta: pageMeta({ page, pageSize, total }),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Properties (admin lookup)                                          */
/* ------------------------------------------------------------------ */
router.get(
  '/properties',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q } = parse(pagination, req.query);
    const clientId = Number(req.query.clientId) || null;
    const where = ['1 = 1'];
    const params = [];
    if (clientId) {
      where.push('p.client_id = ?');
      params.push(clientId);
    }
    if (q) {
      const term = likeTerm(q);
      where.push('(p.lot_no LIKE ? OR p.barangay LIKE ? OR p.city_municipality LIKE ? OR u.full_name LIKE ?)');
      params.push(term, term, term, term);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const base = `FROM properties p JOIN users u ON u.id = p.client_id ${whereSql}`;
    const total = Number((await one(`SELECT COUNT(*) AS total ${base}`, params)).total);
    const rows = await query(
      `SELECT p.*, u.full_name AS client_name ${base} ORDER BY p.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    res.json({
      properties: rows.map((p) => ({
        id: p.id,
        client: { id: p.client_id, name: p.client_name },
        titleHolder: p.title_holder,
        lotNo: p.lot_no,
        blockNo: p.block_no,
        barangay: p.barangay,
        cityMunicipality: p.city_municipality,
        province: p.province,
        addressLine: p.address_line,
        areaSqm: p.area_sqm === null ? null : Number(p.area_sqm),
        titleNo: p.title_no,
        taxDeclarationNo: p.tax_declaration_no,
        createdAt: p.created_at,
      })),
      meta: pageMeta({ page, pageSize, total }),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Archive overview (completed projects)                              */
/* ------------------------------------------------------------------ */
router.get(
  '/archives',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT p.id, p.project_no, p.stage, p.archived_at, p.completed_at, s.name AS service_name,
              u.full_name AS client_name,
              (SELECT COUNT(*) FROM blueprint_versions v JOIN blueprints b ON b.id = v.blueprint_id
                WHERE b.project_id = p.id) AS file_count
         FROM survey_projects p
         JOIN services s ON s.id = p.service_id
         JOIN users u ON u.id = p.client_id
        WHERE p.archived_at IS NOT NULL
        ORDER BY p.archived_at DESC LIMIT 200`,
    );
    res.json({
      archives: rows.map((r) => ({
        id: r.id,
        projectNo: r.project_no,
        stage: r.stage,
        archivedAt: r.archived_at,
        completedAt: r.completed_at,
        serviceName: r.service_name,
        clientName: r.client_name,
        fileCount: Number(r.file_count),
      })),
    });
  }),
);

module.exports = router;
