'use strict';

const express = require('express');
const { z } = require('zod');
const { query, one, transaction } = require('../db');
const { asyncHandler, badRequest, forbidden, notFound } = require('../lib/errors');
const { parse, optionalText } = require('../lib/validate');
const { requireAuth, requireAdmin, canAccessProject } = require('../middleware/auth');
const { notifyUsers, notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');

const router = express.Router();

async function loadConversation(req) {
  const id = Number(req.params.id);
  const convo = await one(
    `SELECT cv.*, c.full_name AS client_name, c.email AS client_email, p.project_no
       FROM conversations cv
       JOIN users c ON c.id = cv.client_id
       LEFT JOIN survey_projects p ON p.id = cv.project_id
      WHERE cv.id = ?`,
    [id],
  );
  if (!convo) throw notFound('Conversation not found.');
  if (req.user.role === 'client' && convo.client_id !== req.user.id) throw forbidden();
  if (req.user.role === 'surveyor') {
    if (!convo.project_id || !(await canAccessProject(req.user, convo.project_id))) {
      throw forbidden('You are not part of this conversation.');
    }
  }
  return convo;
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    let where = '1 = 1';

    if (req.user.role === 'client') {
      where = 'cv.client_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'surveyor') {
      where = `cv.project_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM survey_projects p
         WHERE p.id = cv.project_id
           AND (p.lead_surveyor_id = ? OR EXISTS (SELECT 1 FROM project_assignments pa
                 WHERE pa.project_id = p.id AND pa.staff_id = ? AND pa.unassigned_at IS NULL)))`;
      params.push(req.user.id, req.user.id);
    }

    const rows = await query(
      `SELECT cv.*, c.full_name AS client_name, p.project_no,
              (SELECT body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id AND m.read_at IS NULL AND m.sender_id <> ?) AS unread
         FROM conversations cv
         JOIN users c ON c.id = cv.client_id
         LEFT JOIN survey_projects p ON p.id = cv.project_id
        WHERE ${where}
        ORDER BY COALESCE(last_message_at, cv.created_at) DESC`,
      [req.user.id, ...params],
    );

    res.json({
      conversations: rows.map((c) => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        client: { id: c.client_id, name: c.client_name },
        project: c.project_id ? { id: c.project_id, projectNo: c.project_no } : null,
        lastMessage: c.last_message,
        lastMessageAt: c.last_message_at,
        unread: Number(c.unread || 0),
        createdAt: c.created_at,
      })),
    });
  }),
);

const startSchema = z.object({
  subject: z.string().trim().min(4, 'Enter a subject.').max(180),
  message: z.string().trim().min(5, 'Write your message.').max(4000),
  projectId: z.coerce.number().int().positive().optional().nullable(),
});

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parse(startSchema, req.body);
    const clientId = req.user.role === 'client' ? req.user.id : Number(req.body.clientId);
    if (!clientId) throw badRequest('Select the client for this conversation.');

    if (data.projectId && !(await canAccessProject(req.user, data.projectId))) throw forbidden();

    const id = await transaction(async (conn) => {
      const ins = await conn.execute(
        `INSERT INTO conversations (client_id, project_id, subject, created_by) VALUES (?, ?, ?, ?)`,
        [clientId, data.projectId || null, data.subject, req.user.id],
      );
      const convoId = ins[0].insertId;
      await conn.execute(`INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`, [
        convoId,
        req.user.id,
        data.message,
      ]);
      return convoId;
    });

    if (req.user.role === 'client') {
      await notifyAdmins({
        type: 'message',
        title: 'New client message',
        message: `${req.user.full_name}: ${data.subject}`,
        link: `/admin/messages/${id}`,
      });
    } else {
      await notifyUsers(clientId, {
        type: 'message',
        title: 'Message from the office',
        message: data.subject,
        link: `/app/messages/${id}`,
      });
    }
    await audit(req, 'conversation.create', `Conversation "${data.subject}" started`, {
      entityType: 'conversation',
      entityId: id,
    });

    res.status(201).json({ ok: true, id, message: 'Message sent.' });
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const convo = await loadConversation(req);
    const messages = await query(
      `SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ? ORDER BY m.created_at ASC, m.id ASC`,
      [convo.id],
    );

    await query(
      `UPDATE messages SET read_at = NOW() WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`,
      [convo.id, req.user.id],
    );

    res.json({
      conversation: {
        id: convo.id,
        subject: convo.subject,
        status: convo.status,
        client: { id: convo.client_id, name: convo.client_name, email: convo.client_email },
        project: convo.project_id ? { id: convo.project_id, projectNo: convo.project_no } : null,
        createdAt: convo.created_at,
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        sender: { id: m.sender_id, name: m.sender_name, role: m.sender_role, isMe: m.sender_id === req.user.id },
        createdAt: m.created_at,
      })),
      canReply: convo.status === 'open',
      isAdmin: req.user.role === 'admin',
    });
  }),
);

const replySchema = z.object({ body: z.string().trim().min(1, 'Write a message.').max(4000) });

router.post(
  '/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const convo = await loadConversation(req);
    if (convo.status === 'closed') throw badRequest('This conversation is closed. Start a new inquiry instead.');
    const data = parse(replySchema, req.body);

    const result = await query(`INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`, [
      convo.id,
      req.user.id,
      data.body,
    ]);
    await query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [convo.id]);

    if (req.user.role === 'client') {
      await notifyAdmins({
        type: 'message',
        title: 'New client reply',
        message: `${req.user.full_name} replied in "${convo.subject}".`,
        link: `/admin/messages/${convo.id}`,
      });
    } else {
      await notifyUsers(convo.client_id, {
        type: 'message',
        title: 'New reply from the office',
        message: `Re: ${convo.subject}`,
        link: `/app/messages/${convo.id}`,
      });
    }

    res.status(201).json({ ok: true, id: result.insertId });
  }),
);

router.patch(
  '/:id/close',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const convo = await loadConversation(req);
    await query(`UPDATE conversations SET status = 'closed' WHERE id = ?`, [convo.id]);
    await notifyUsers(convo.client_id, {
      type: 'message',
      title: 'Conversation closed',
      message: `"${convo.subject}" has been marked resolved. You can start a new inquiry any time.`,
      link: '/app/messages',
    });
    await audit(req, 'conversation.close', `Closed conversation #${convo.id}`, {
      entityType: 'conversation',
      entityId: convo.id,
    });
    res.json({ ok: true, message: 'Conversation closed.' });
  }),
);

router.patch(
  '/:id/reopen',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const convo = await loadConversation(req);
    await query(`UPDATE conversations SET status = 'open' WHERE id = ?`, [convo.id]);
    res.json({ ok: true, message: 'Conversation reopened.' });
  }),
);

module.exports = router;
