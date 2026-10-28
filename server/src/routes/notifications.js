'use strict';

const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db');
const { asyncHandler, notFound, forbidden } = require('../lib/errors');
const { parse, pagination } = require('../lib/validate');
const { requireAuth } = require('../middleware/auth');
const { pageMeta } = require('../lib/format');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parse(pagination, req.query);
    const onlyUnread = req.query.unread === '1';

    const where = ['user_id = ?'];
    const params = [req.user.id];
    if (onlyUnread) where.push('is_read = 0');
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const total = Number((await one(`SELECT COUNT(*) AS total FROM notifications ${whereSql}`, params)).total);
    const unread = Number(
      (await one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id])).c,
    );

    const rows = await query(
      `SELECT * FROM notifications ${whereSql} ORDER BY created_at DESC, id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );

    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        isRead: !!n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
      unread,
      meta: pageMeta({ page, pageSize, total }),
    });
  }),
);

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = await one('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!row) throw notFound('Notification not found.');
    await query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ?', [id]);
    res.json({ ok: true });
  }),
);

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0', [
      req.user.id,
    ]);
    res.json({ ok: true, message: 'All notifications marked as read.' });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = await one('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!row) throw notFound('Notification not found.');
    await query('DELETE FROM notifications WHERE id = ?', [id]);
    res.json({ ok: true });
  }),
);

module.exports = router;
