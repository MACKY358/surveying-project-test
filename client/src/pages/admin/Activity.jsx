import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
  Pagination,
  SearchInput,
} from '../../components/ui.jsx';
import { dateTimeLabel, relativeTime, roleLabel, titleCase } from '../../utils.js';

const ACTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'project', label: 'Projects' },
  { value: 'document', label: 'Documents' },
  { value: 'blueprint', label: 'Survey plans' },
  { value: 'client', label: 'Clients' },
  { value: 'staff', label: 'Staff accounts' },
  { value: 'service', label: 'Services' },
  { value: 'fee', label: 'Fees' },
  { value: 'requirement', label: 'Requirements' },
  { value: 'settings', label: 'Settings' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'inquiry', label: 'Inquiries' },
  { value: 'message', label: 'Messages' },
  { value: 'schedule', label: 'Schedules' },
  { value: 'report', label: 'Reports & exports' },
  { value: 'auth', label: 'Sign-ins' },
];

function actionTone(action = '') {
  if (/reject|cancel|delete|archive|deactivate/.test(action)) return 'red';
  if (/create|approve|confirm|release|complete/.test(action)) return 'green';
  if (/update|edit|reschedule|stage|review/.test(action)) return 'blue';
  if (/login|logout|auth|password/.test(action)) return 'violet';
  if (/export|report/.test(action)) return 'amber';
  return 'slate';
}

function actionLabel(action = '') {
  return titleCase(action.replace(/\./g, ' · '));
}

export default function Activity() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [action, setAction] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const { data, loading, error, reload } = useAsync(
    () => api.get('/admin/activity', { page, pageSize: 25, q: debouncedQ, action, from, to }),
    [page, debouncedQ, action, from, to],
  );

  const logs = data?.logs || [];
  const filtered = debouncedQ || action !== 'all' || from || to;

  function clearFilters() {
    setQ('');
    setAction('all');
    setFrom('');
    setTo('');
    setPage(1);
  }

  return (
    <>
      <PageHead
        title="Activity log"
        subtitle="A permanent record of administrative actions, document decisions and sign-in events."
        actions={
          <button type="button" className="btn btn--secondary" onClick={() => reload()} disabled={loading}>
            <Icon name="refresh" size={16} /> Refresh
          </button>
        }
      />

      <Card className="mb-2">
        <div className="filters">
          <div style={{ flex: 2 }}>
            <SearchInput
              value={q}
              onChange={(value) => {
                setQ(value);
                setPage(1);
              }}
              placeholder="Search description, person or action…"
            />
          </div>
          <Field label="Category" htmlFor="activity-action">
            <select
              id="activity-action"
              className="select"
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            >
              {ACTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="From" htmlFor="activity-from">
            <input
              id="activity-from"
              className="input"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="To" htmlFor="activity-to">
            <input
              id="activity-to"
              className="input"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>
        {filtered ? (
          <button type="button" className="link-btn small mt-1" onClick={clearFilters}>
            Clear all filters
          </button>
        ) : null}
      </Card>

      {loading && !data ? <Loading label="Loading the activity log…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !logs.length ? (
        <Card>
          <Empty
            icon="activity"
            title={filtered ? 'No activity matches those filters' : 'No activity recorded yet'}
            message={filtered ? 'Try a wider date range or a different category.' : 'Office actions will appear here as staff use the system.'}
            action={filtered ? <button type="button" className="btn btn--secondary" onClick={clearFilters}>Clear filters</button> : null}
          />
        </Card>
      ) : null}

      {logs.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Description</th>
                  <th>By</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td data-label="When">
                      <span className="cell-main small">{relativeTime(log.createdAt)}</span>
                      <span className="cell-sub">{dateTimeLabel(log.createdAt)}</span>
                    </td>
                    <td data-label="Action">
                      <Badge tone={actionTone(log.action)}>{actionLabel(log.action)}</Badge>
                    </td>
                    <td data-label="Description">
                      <span className="small wrap-anywhere">{log.description}</span>
                      {log.entityType ? <span className="cell-sub">{titleCase(log.entityType)}{log.entityId ? ` #${log.entityId}` : ''}</span> : null}
                    </td>
                    <td data-label="By">
                      <span className="small">{log.actor}</span>
                      <span className="cell-sub">{log.actorRole ? roleLabel(log.actorRole) : 'System'}</span>
                    </td>
                    <td data-label="IP address">
                      <span className="tiny mono muted">{log.ip || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 .9rem .6rem' }}>
            <Pagination meta={data.meta} onPage={setPage} label={`${data.meta.total} entr${data.meta.total === 1 ? 'y' : 'ies'}`} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
