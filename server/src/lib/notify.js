'use strict';

const { query, one } = require('../db');
const config = require('../config');
const { sendMail } = require('./mailer');

/**
 * Create in-app notifications for one or many users.
 * @param {number|number[]} userIds
 */
async function notifyUsers(userIds, { type = 'general', title, message, link = null }) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (!ids.length) return;
  const values = ids.map(() => '(?, ?, ?, ?, ?, 0)').join(', ');
  const params = [];
  for (const id of ids) {
    params.push(id, String(type).slice(0, 40), String(title).slice(0, 180), String(message).slice(0, 500), link);
  }
  await query(
    `INSERT INTO notifications (user_id, type, title, message, link, is_read) VALUES ${values}`,
    params,
  );
  await maybeEmail(ids, title, message, link);
}

/** Notify every active admin. */
async function notifyAdmins(payload, excludeUserId = null) {
  const admins = await query(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = 1 AND deleted_at IS NULL${
      excludeUserId ? ' AND id <> ?' : ''
    }`,
    excludeUserId ? [excludeUserId] : [],
  );
  await notifyUsers(admins.map((a) => a.id), payload);
}

async function notifyStaff(payload) {
  const staff = await query(`SELECT id FROM users WHERE role = 'surveyor' AND is_active = 1 AND deleted_at IS NULL`);
  await notifyUsers(staff.map((s) => s.id), payload);
}

/**
 * Email delivery is optional and disabled unless SMTP is configured.
 * The call is deliberately fire-and-forget so a mail outage never breaks
 * a booking or document upload.
 */
async function maybeEmail(userIds, subject, body, link) {
  if (!config.email.enabled) return;
  try {
    const placeholders = userIds.map(() => '?').join(',');
    const users = await query(`SELECT email, full_name FROM users WHERE id IN (${placeholders}) AND is_active = 1`, userIds);
    for (const u of users) {
      // eslint-disable-next-line no-await-in-loop
      await sendMail({ to: u.email, subject, text: `${u.full_name},\n\n${body}${link ? `\n\nOpen: ${link}` : ''}` });
    }
  } catch (err) {
    console.error('[notify] email failed:', err.message);
  }
}

/** Count unread notifications for badge display. */
async function unreadCount(userId) {
  const row = await one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  return Number(row ? row.c : 0);
}

module.exports = { notifyUsers, notifyAdmins, notifyStaff, unreadCount, maybeEmail };
