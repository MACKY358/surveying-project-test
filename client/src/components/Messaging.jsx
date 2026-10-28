// Shared secure messaging between clients, the office and field staff.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import {
  Alert,
  Avatar,
  Badge,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  StatusBadge,
  useConfirm,
  useToast,
} from './ui.jsx';
import { cn, dateLabel, dateTimeLabel, relativeTime } from '../utils.js';
import { messagesPath, projectPath } from './bits.jsx';

export default function Messaging() {
  const { id } = useParams();
  const { user, refreshUnread } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [composeOpen, setComposeOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const threadEndRef = useRef(null);

  const listState = useAsync(() => api.get('/messages'), [id]);
  const detailState = useAsync(
    () => (id ? api.get(`/messages/${id}`) : Promise.resolve(null)),
    [id],
  );

  const conversations = listState.data?.conversations || [];
  const detail = detailState.data;
  const conversation = detail?.conversation;

  useEffect(() => {
    if (detail) {
      refreshUnread();
      const timer = window.setTimeout(() => {
        if (threadEndRef.current) threadEndRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }, 80);
      return () => window.clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.messages?.length, id]);

  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setReplyError('');
    try {
      await api.post(`/messages/${id}/messages`, { body: reply.trim() });
      setReply('');
      await detailState.reload(true);
      await listState.reload(true);
    } catch (err) {
      setReplyError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus() {
    if (!conversation) return;
    const closing = conversation.status === 'open';
    const ok = await confirm({
      title: closing ? 'Close conversation' : 'Reopen conversation',
      message: closing
        ? 'The client will be able to read the thread but not reply. You can reopen it later.'
        : 'The other party will be able to reply again.',
      confirmLabel: closing ? 'Close conversation' : 'Reopen',
    });
    if (!ok) return;
    try {
      const result = await api.patch(`/messages/${id}/${closing ? 'close' : 'reopen'}`);
      toast.success(result.message || 'Conversation updated.');
      await detailState.reload(true);
      await listState.reload(true);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <div className={cn('chat-layout', id && 'chat-layout--thread')}>
        <div className={cn('card card--flush', id && 'hide-mobile')} style={{ alignSelf: 'start' }}>
          <div className="card__head" style={{ padding: '.8rem .9rem' }}>
            <div>
              <h2>Conversations</h2>
              <p className="sub">{conversations.length} thread{conversations.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => setComposeOpen(true)}>
              <Icon name="plus" size={15} /> New
            </button>
          </div>
          <div className="chat-list">
            {listState.loading && !listState.data ? <Loading label="Loading messages…" /> : null}
            {listState.error ? <div style={{ padding: '.9rem' }}><ErrorState error={listState.error} onRetry={() => listState.reload()} /></div> : null}
            {!listState.loading && !conversations.length ? (
              <Empty
                icon="message"
                title="No conversations yet"
                message={user?.role === 'client' ? 'Start a conversation with the office about a project or your survey.' : 'Messages from clients will appear here.'}
                action={
                  <button type="button" className="btn btn--sm" onClick={() => setComposeOpen(true)}>
                    <Icon name="plus" size={15} /> Start a conversation
                  </button>
                }
              />
            ) : null}
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn('chat-item', String(c.id) === String(id) && 'active')}
                onClick={() => navigate(messagesPath(user?.role, c.id))}
                style={{ width: '100%', textAlign: 'left' }}
              >
                <div className="chat-item__top">
                  <span className="chat-item__subject">{c.subject}</span>
                  {c.unread > 0 ? <span className="badge badge--green">{c.unread}</span> : null}
                </div>
                <div className="chat-item__meta">
                  {user?.role !== 'client' ? `${c.client.name} · ` : ''}
                  {c.project ? `${c.project.projectNo} · ` : ''}
                  {c.lastMessageAt ? relativeTime(c.lastMessageAt) : dateLabel(c.createdAt)}
                </div>
                {c.lastMessage ? <div className="chat-item__meta" style={{ marginTop: 2 }}>{c.lastMessage}</div> : null}
              </button>
            ))}
          </div>
        </div>

        <div className={cn(!id && 'hide-mobile')}>
          {!id ? (
            <div className="card">
              <Empty
                icon="message"
                title="Select a conversation"
                message="Choose a thread on the left to read the full history and reply."
              />
            </div>
          ) : detailState.loading && !detail ? (
            <div className="card"><Loading label="Opening the conversation…" /></div>
          ) : detailState.error ? (
            <div className="card">
              <ErrorState error={detailState.error} onRetry={() => detailState.reload()} />
              <div className="btn-row mt-2">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate(messagesPath(user?.role))}>
                  <Icon name="arrowLeft" size={14} /> Back to all messages
                </button>
              </div>
            </div>
          ) : conversation ? (
            <div className="card chat-thread">
              <div className="card__head" style={{ padding: '.75rem .9rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-1 wrap">
                    <button
                      type="button"
                      className="icon-btn hide-desktop"
                      onClick={() => navigate(messagesPath(user?.role))}
                      aria-label="Back to conversations"
                      style={{ width: 32, height: 32, marginLeft: -6 }}
                    >
                      <Icon name="arrowLeft" size={18} />
                    </button>
                    <h2 className="wrap-anywhere" style={{ fontSize: '.98rem' }}>{conversation.subject}</h2>
                    <StatusBadge status={conversation.status} />
                  </div>
                  <p className="sub">
                    {user?.role !== 'client' ? `${conversation.client.name} · ${conversation.client.email}` : 'With the office'}
                    {conversation.project ? (
                      <>
                        {' · '}
                        <Link to={projectPath(user?.role, conversation.project.id)}>
                          {conversation.project.projectNo}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {detail.isAdmin ? (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={toggleStatus}>
                    {conversation.status === 'open' ? 'Close' : 'Reopen'}
                  </button>
                ) : null}
              </div>

              <div className="chat-thread__messages">
                <div className="message-list">
                  {(detail.messages || []).map((m) => (
                    <div key={m.id} className={cn('message', m.sender.isMe ? 'message--me' : 'message--them')}>
                      {!m.sender.isMe ? (
                        <div className="tiny" style={{ fontWeight: 700, marginBottom: 2 }}>
                          {m.sender.name}
                          {m.sender.role === 'admin' ? ' · Office' : m.sender.role === 'surveyor' ? ' · Surveyor' : ''}
                        </div>
                      ) : null}
                      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
                      <span className="message__meta">{dateTimeLabel(m.createdAt)}</span>
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>
              </div>

              {replyError ? <Alert tone="danger" title="Message not sent">{replyError}</Alert> : null}

              {detail.canReply ? (
                <form className="composer" onSubmit={sendReply}>
                  <label className="sr-only" htmlFor="reply-body">Write a reply</label>
                  <textarea
                    id="reply-body"
                    className="textarea"
                    rows={2}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply…"
                    maxLength={4000}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        sendReply(e);
                      }
                    }}
                  />
                  <button type="submit" className="btn" disabled={sending || !reply.trim()} aria-label="Send reply">
                    {sending ? <span className="spinner" /> : <Icon name="send" size={17} />}
                    <span className="hide-mobile">Send</span>
                  </button>
                </form>
              ) : (
                <Alert tone="info" title="Conversation closed">
                  This thread is closed. Start a new conversation if you need more help.
                </Alert>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {composeOpen ? (
        <ComposeModal
          role={user?.role}
          onClose={() => setComposeOpen(false)}
          onDone={(newId) => {
            setComposeOpen(false);
            listState.reload(true);
            navigate(messagesPath(user?.role, newId));
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Start a conversation                                                */
/* ------------------------------------------------------------------ */
function ComposeModal({ role, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ subject: '', message: '', projectId: '', clientId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  const projectsState = useAsync(() => api.get('/projects', { pageSize: 100 }), []);
  const clientsState = useAsync(
    () => (role === 'admin' ? api.get('/admin/clients', { pageSize: 100 }) : Promise.resolve({ clients: [] })),
    [role],
  );

  const projects = projectsState.data?.projects || [];
  const clients = clientsState.data?.clients || [];
  const selectedProject = projects.find((p) => String(p.id) === String(form.projectId));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const payload = {
        subject: form.subject.trim(),
        message: form.message.trim(),
        projectId: form.projectId ? Number(form.projectId) : undefined,
      };
      if (role === 'admin') payload.clientId = Number(form.clientId || selectedProject?.client?.id);
      if (role === 'surveyor') payload.clientId = selectedProject?.client?.id;
      if (!payload.clientId && role !== 'client') {
        setError('Choose the client or project for this conversation.');
        setBusy(false);
        return;
      }
      const result = await api.post('/messages', payload);
      toast.success(result.message || 'Message sent.');
      onDone(result.id);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New conversation"
      subtitle={
        role === 'client'
          ? 'The office replies during business hours. Email notifications are not configured, so check this portal for replies.'
          : 'Start a thread with a client about a project or request.'
      }
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="compose-form" className="btn" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="send" size={15} />} Send message
          </button>
        </>
      }
    >
      <form id="compose-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not start the conversation">{error}</Alert> : null}
        {role !== 'client' ? (
          <Field
            label={role === 'surveyor' ? 'Project' : 'Client'}
            htmlFor="compose-client"
            required={role === 'admin' && !form.projectId}
            error={fields.clientId}
            hint={role === 'surveyor' ? 'Choose one of your assigned projects.' : 'Choose the client, or pick a project below.'}
          >
            {role === 'admin' ? (
              <select id="compose-client" className="select" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName} — {c.email}</option>
                ))}
              </select>
            ) : (
              <select
                id="compose-client"
                className="select"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                required
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.projectNo} — {p.client.name}</option>
                ))}
              </select>
            )}
          </Field>
        ) : null}

        <Field label="Project (optional)" htmlFor="compose-project" hint="Link this message to a survey project for context.">
          <select
            id="compose-project"
            className="select"
            value={form.projectId}
            onChange={(e) => {
              const next = e.target.value;
              const proj = projects.find((p) => String(p.id) === String(next));
              setForm({ ...form, projectId: next, clientId: role === 'admin' && proj ? String(proj.client.id) : form.clientId });
            }}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectNo} — {p.service.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Subject" htmlFor="compose-subject" required error={fields.subject}>
          <input
            id="compose-subject"
            className="input"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="e.g. Question about my boundary survey schedule"
            maxLength={180}
            required
          />
        </Field>
        <Field label="Message" htmlFor="compose-message" required error={fields.message}>
          <textarea
            id="compose-message"
            className="textarea"
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Write your message to the office…"
            maxLength={4000}
            required
          />
        </Field>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Never send passwords, full ID numbers or payment details through chat.
        </p>
      </form>
    </Modal>
  );
}
