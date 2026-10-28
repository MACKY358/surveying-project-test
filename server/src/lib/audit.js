'use strict';

const { query } = require('../db');

/**
 * Append an immutable audit-trail entry. Never throws into the request path.
 */
async function audit(req, action, description, extra = {}) {
  try {
    const actor = req.user || null;
    const userAgent =
      typeof req.get === 'function' ? req.get('user-agent') : req.headers && req.headers['user-agent'];
    await query(
      `INSERT INTO activity_logs
        (actor_id, actor_role, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actor ? actor.id : null,
        actor ? actor.role : null,
        String(action).slice(0, 80),
        extra.entityType ? String(extra.entityType).slice(0, 40) : null,
        extra.entityId || null,
        String(description).slice(0, 500),
        (req.ip || '').slice(0, 45) || null,
        String(userAgent || '').slice(0, 255) || null,
      ],
    );
  } catch (err) {
    console.error('[audit] failed to write log:', err.message);
  }
}

module.exports = { audit };
