'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, one, transaction, tquery } = require('../db');
const { asyncHandler, unauthorized, badRequest, tooMany, notFound } = require('../lib/errors');
const { parse, email, password, phone, trimmed, optionalText } = require('../lib/validate');
const { createSession, destroySession, requireAuth, hashToken } = require('../middleware/auth');
const { issueToken, CSRF_COOKIE } = require('../middleware/csrf');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');
const { notifyAdmins, unreadCount } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { initials } = require('../lib/format');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    isActive: !!user.is_active,
    mustChangePassword: !!user.must_change_password,
    privacyAcceptedAt: user.privacy_accepted_at,
    createdAt: user.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* CSRF bootstrap                                                      */
/* ------------------------------------------------------------------ */
router.get('/csrf', (req, res) => {
  res.json({ csrfToken: issueToken(req, res) });
});

/* ------------------------------------------------------------------ */
/* Registration (clients only — staff accounts are created by admins)  */
/* ------------------------------------------------------------------ */
const registerSchema = z.object({
  fullName: trimmed(150, 'Full name'),
  email,
  password,
  phone,
  addressLine: optionalText(255),
  barangay: optionalText(120),
  cityMunicipality: optionalText(120),
  province: optionalText(120),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the privacy notice to create an account.' }),
  }),
});

router.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(registerSchema, req.body);

    const existing = await one('SELECT id FROM users WHERE email = ?', [data.email]);
    if (existing) throw badRequest('An account with that email already exists.', { email: 'Email already registered.' });

    const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const userId = await transaction(async (conn) => {
      const result = await conn.execute(
        `INSERT INTO users (role, email, password_hash, full_name, phone, privacy_accepted_at)
         VALUES ('client', ?, ?, ?, ?, NOW())`,
        [data.email, hash, data.fullName, data.phone],
      );
      const id = result[0].insertId;
      await tquery(
        conn,
        `INSERT INTO client_profiles (user_id, address_line, barangay, city_municipality, province)
         VALUES (?, ?, ?, ?, ?)`,
        [id, data.addressLine, data.barangay, data.cityMunicipality, data.province],
      );
      return id;
    });

    const user = await one('SELECT * FROM users WHERE id = ?', [userId]);
    await createSession(req, res, user);
    await audit({ ...req, user: { id: userId, role: 'client' } }, 'account.register', `New client account created: ${data.email}`, {
      entityType: 'user',
      entityId: userId,
    });
    await notifyAdmins({
      type: 'account',
      title: 'New client registered',
      message: `${data.fullName} created a client account.`,
      link: '/admin/clients',
    });

    res.status(201).json({ user: publicUser(user), csrfToken: issueToken(req, res) });
  }),
);

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */
const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(128),
});

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(loginSchema, req.body);

    // Always return the same message so accounts cannot be enumerated.
    const generic = 'Incorrect email or password.';
    const user = await one('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [data.email]);
    if (!user) {
      // Constant-ish time: still run a hash comparison.
      await bcrypt.compare(data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu');
      throw unauthorized(generic);
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw tooMany('This account is temporarily locked after several failed attempts. Try again later.');
    }

    if (!user.is_active) {
      throw unauthorized('This account has been deactivated. Please contact the office.');
    }

    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) {
      const attempts = Number(user.failed_attempts || 0) + 1;
      const lock = attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
      await query(
        `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
        [attempts, lock ? lock.toISOString().slice(0, 19).replace('T', ' ') : null, user.id],
      );
      if (lock) {
        throw tooMany(`Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`);
      }
      throw unauthorized(generic);
    }

    await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [user.id]);
    await createSession(req, res, user);
    await audit({ ...req, user: { id: user.id, role: user.role } }, 'auth.login', `${user.full_name} signed in`);

    res.json({ user: publicUser(user), csrfToken: issueToken(req, res) });
  }),
);

/* ------------------------------------------------------------------ */
/* Logout                                                              */
/* ------------------------------------------------------------------ */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    if (req.user) {
      await audit(req, 'auth.logout', `${req.user.full_name} signed out`);
    }
    await destroySession(req, res);
    res.json({ ok: true, csrfToken: issueToken(req, res) });
  }),
);

/* ------------------------------------------------------------------ */
/* Current user                                                        */
/* ------------------------------------------------------------------ */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user) return res.json({ user: null, csrfToken: issueToken(req, res) });

    const row = await one(
      `SELECT u.*, cp.address_line, cp.barangay, cp.city_municipality, cp.province, cp.postal_code,
              cp.valid_id_type, cp.valid_id_number, cp.client_type, cp.company_name,
              sp.employee_no, sp.position, sp.license_no, sp.specialization, sp.max_daily_projects
         FROM users u
         LEFT JOIN client_profiles cp ON cp.user_id = u.id
         LEFT JOIN staff_profiles sp ON sp.user_id = u.id
        WHERE u.id = ?`,
      [req.user.id],
    );
    if (!row) throw unauthorized();

    res.json({
      user: {
        ...publicUser(row),
        initials: initials(row.full_name),
        profile:
          row.role === 'client'
            ? {
                addressLine: row.address_line,
                barangay: row.barangay,
                cityMunicipality: row.city_municipality,
                province: row.province,
                postalCode: row.postal_code,
                validIdType: row.valid_id_type,
                validIdNumber: row.valid_id_number,
                clientType: row.client_type,
                companyName: row.company_name,
              }
            : {
                employeeNo: row.employee_no,
                position: row.position,
                licenseNo: row.license_no,
                specialization: row.specialization,
                maxDailyProjects: row.max_daily_projects,
              },
      },
      unreadNotifications: await unreadCount(row.id),
      csrfToken: issueToken(req, res),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Profile update                                                      */
/* ------------------------------------------------------------------ */
const profileSchema = z.object({
  fullName: trimmed(150, 'Full name'),
  phone,
  addressLine: optionalText(255),
  barangay: optionalText(120),
  cityMunicipality: optionalText(120),
  province: optionalText(120),
  postalCode: optionalText(12),
  validIdType: optionalText(80),
  validIdNumber: optionalText(80),
  companyName: optionalText(160),
  clientType: z.enum(['individual', 'company', 'government']).optional(),
});

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parse(profileSchema, req.body);

    await transaction(async (conn) => {
      await tquery(conn, 'UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [
        data.fullName,
        data.phone,
        req.user.id,
      ]);
      if (req.user.role === 'client') {
        await tquery(
          conn,
          `INSERT INTO client_profiles
             (user_id, address_line, barangay, city_municipality, province, postal_code, valid_id_type, valid_id_number, company_name, client_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             address_line = VALUES(address_line), barangay = VALUES(barangay),
             city_municipality = VALUES(city_municipality), province = VALUES(province),
             postal_code = VALUES(postal_code), valid_id_type = VALUES(valid_id_type),
             valid_id_number = VALUES(valid_id_number), company_name = VALUES(company_name),
             client_type = VALUES(client_type)`,
          [
            req.user.id,
            data.addressLine,
            data.barangay,
            data.cityMunicipality,
            data.province,
            data.postalCode,
            data.validIdType,
            data.validIdNumber,
            data.companyName,
            data.clientType || 'individual',
          ],
        );
      }
    });

    await audit(req, 'profile.update', `${req.user.full_name} updated their profile`);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ */
/* Password change                                                     */
/* ------------------------------------------------------------------ */
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: password,
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'The new passwords do not match.',
    path: ['confirmPassword'],
  });

router.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parse(passwordSchema, req.body);
    const row = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!row) throw notFound('Account not found.');

    const ok = await bcrypt.compare(data.currentPassword, row.password_hash);
    if (!ok) throw badRequest('Your current password is incorrect.', { currentPassword: 'Incorrect password.' });
    if (await bcrypt.compare(data.newPassword, row.password_hash)) {
      throw badRequest('Choose a password you have not used before.', { newPassword: 'Password is unchanged.' });
    }

    const hash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, req.user.id]);

    // Invalidate every other session for this account.
    await query('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [req.user.id, req.sessionId || '']);
    await audit(req, 'account.password', `${req.user.full_name} changed their password`);
    res.json({ ok: true, message: 'Password updated. Other devices have been signed out.' });
  }),
);

/* ------------------------------------------------------------------ */
/* Session list (privacy hygiene)                                      */
/* ------------------------------------------------------------------ */
router.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, ip_address, user_agent, created_at, last_seen_at, expires_at
         FROM sessions WHERE user_id = ? AND expires_at > NOW() ORDER BY last_seen_at DESC`,
      [req.user.id],
    );
    res.json({
      sessions: rows.map((r) => ({
        id: r.id,
        current: r.id === req.sessionId,
        ip: r.ip_address,
        userAgent: r.user_agent,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
      })),
    });
  }),
);

router.delete(
  '/sessions/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    // `id` is the hash; only the owner's own sessions can be revoked.
    const raw = String(req.params.id || '');
    await query('DELETE FROM sessions WHERE user_id = ? AND id = ?', [req.user.id, raw]);
    res.json({ ok: true });
  }),
);

module.exports = router;
module.exports.hashToken = hashToken;
