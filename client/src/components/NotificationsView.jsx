// Shared notification centre for clients, administrators and surveyors.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import {
  Empty,
  ErrorState,
  Loading,
  Pagination,
  SearchInput,
  Tabs,
  useConfirm,
  useToast,
} from './ui.jsx';
import { cn, dateTimeLabel, relativeTime } from '../utils.js';

const TYPE_ICON = {
  appointment: 'calendar',
  document: 'file',
  project: 'folder',
  message: 'message',
  blueprint: 'layers',
  inquiry: 'mail',
  account: 'user',
  announcement: 'bell',
  schedule: 'clock',
  payment: 'clipboard',
};

export default function NotificationsView() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshUnread } = useAuth();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload, setData } = useAsync(
    () => api.get('/notifications', { page, pageSize: 15, unread: tab === 'unread' ? 1 : undefined }),
    [tab, page],
  );

  const notifications = data?.notifications || [];
  const filtered = q
    ? notifications.filter((n) => `${n.title} ${n.message}`.toLowerCase().includes(q.toLowerCase()))
    : notifications;

  async function markAll() {
    setBusy(true);
    try {
      const result = await api.post('/notifications/read-all');
      toast.success(result.message || 'All notifications marked as read.');
      setData((current) =>
        current
          ? { ...current, notifications: current.notifications.map((n) => ({ ...n, isRead: true })), unread: 0 }
          : current,
      );
      await refreshUnread();
      if (tab === 'unread') await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function open(notification) {
    try {
      if (!notification.isRead) {
        await api.post(`/notifications/${notification.id}/read`);
        setData((current) =>
          current
            ? {
                ...current,
                notifications: current.notifications.map((n) =>
                  n.id === notification.id ? { ...n, isRead: true } : n,
                ),
                unread: Math.max(0, Number(current.unread || 0) - 1),
              }
            : current,
        );
        await refreshUnread();
      }
      if (notification.link) navigate(notification.link);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove(notification) {
    const ok = await confirm({
      title: 'Remove notification',
      message: 'This notification will be removed from your account.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/notifications/${notification.id}`);
      setData((current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.filter((n) => n.id !== notification.id),
              unread: notification.isRead ? current.unread : Math.max(0, Number(current.unread || 0) - 1),
            }
          : current,
      );
      await refreshUnread();
      toast.success('Notification removed.');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <div className="flex wrap items-center justify-between gap-1 mb-2">
        <Tabs
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread', count: data?.unread || 0 },
          ]}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setPage(1);
          }}
          ariaLabel="Notification filters"
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={markAll} disabled={busy || !Number(data?.unread)}>
          {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Mark all read
        </button>
      </div>

      <div className="card card--flush">
        <div style={{ padding: '.85rem' }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search notifications…" />
        </div>

        {loading && !data ? <Loading label="Loading notifications…" /> : null}
        {error ? <div style={{ padding: '1rem' }}><ErrorState error={error} onRetry={() => reload()} /></div> : null}

        {!loading && data && !filtered.length ? (
          <Empty
            icon="bell"
            title={tab === 'unread' ? 'You are all caught up' : 'No notifications yet'}
            message={
              tab === 'unread'
                ? 'New appointment, document and project updates will appear here.'
                : 'Office updates about your appointments, projects and documents will appear here.'
            }
          />
        ) : null}

        <div>
          {filtered.map((n) => (
            <div key={n.id} className={cn('doc-review-row', !n.isRead && 'is-unread')}>
              <span
                className="file-tile__icon"
                style={{ width: 38, height: 38, borderRadius: 10 }}
                aria-hidden="true"
              >
                <Icon name={TYPE_ICON[n.type] || 'bell'} size={18} />
              </span>
              <button
                type="button"
                className="doc-review-row__body"
                onClick={() => open(n)}
                style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: n.link ? 'pointer' : 'default' }}
              >
                <div className="flex items-center gap-1 wrap">
                  <b style={{ fontSize: '.88rem' }}>{n.title}</b>
                  {!n.isRead ? <span className="badge badge--green">New</span> : null}
                </div>
                <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{n.message}</div>
                <div className="tiny muted" style={{ marginTop: 2 }} title={dateTimeLabel(n.createdAt)}>
                  {relativeTime(n.createdAt)} · {dateTimeLabel(n.createdAt)}
                </div>
              </button>
              <div className="table-actions">
                {n.link ? (
                  <button type="button" className="icon-btn" aria-label="Open related record" onClick={() => open(n)}>
                    <Icon name="arrowRight" size={17} />
                  </button>
                ) : null}
                <button type="button" className="icon-btn" aria-label="Remove notification" onClick={() => remove(n)}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {q && notifications.length && !filtered.length ? (
          <Empty icon="search" title="No matches" message="Try a different word." />
        ) : null}

        <div style={{ padding: '.5rem .85rem' }}>
          <Pagination meta={data?.meta} onPage={setPage} />
        </div>
      </div>
    </>
  );
}
