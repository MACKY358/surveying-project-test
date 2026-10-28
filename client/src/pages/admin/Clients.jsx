import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Avatar,
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
import { dateLabel, relativeTime } from '../../utils.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All accounts' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Deactivated' },
];

export default function Clients() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const { data, loading, error, reload } = useAsync(
    () => api.get('/admin/clients', { page, pageSize: 15, q: debouncedQ, status }),
    [page, debouncedQ, status],
  );

  const clients = data?.clients || [];
  const filtered = debouncedQ || status !== 'all';

  return (
    <>
      <PageHead
        title="Clients"
        subtitle="Every registered landowner, developer and institution with an account on the portal."
        actions={
          <Link className="btn btn--secondary" to="/admin/reports">
            <Icon name="chart" size={16} /> Client reports
          </Link>
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
              placeholder="Search name, email, phone or town…"
            />
          </div>
          <Field label="Account status" htmlFor="client-status">
            <select
              id="client-status"
              className="select"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button type="button" className="btn btn--secondary btn--block" onClick={() => reload()} disabled={loading}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
          </div>
        </div>
      </Card>

      {loading && !data ? <Loading label="Loading client accounts…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !clients.length ? (
        <Card>
          <Empty
            icon="users"
            title={filtered ? 'No clients match those filters' : 'No client accounts yet'}
            message={
              filtered
                ? 'Try a different search term or clear the account filter.'
                : 'Clients appear here as soon as they register on the public website.'
            }
            action={
              filtered ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setQ('');
                    setStatus('all');
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link className="btn" to="/">
                  <Icon name="external" size={16} /> Open public website
                </Link>
              )
            }
          />
        </Card>
      ) : null}

      {clients.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Records</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td data-label="Client">
                      <div className="person">
                        <Avatar name={client.fullName} size="sm" tone={client.clientType === 'company' ? 'navy' : ''} />
                        <div style={{ minWidth: 0 }}>
                          <Link className="cell-main" to={`/admin/clients/${client.id}`}>
                            {client.fullName}
                          </Link>
                          <span className="cell-sub">
                            {client.clientType === 'company' && client.companyName
                              ? client.companyName
                              : `Client since ${dateLabel(client.createdAt)}`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Contact">
                      <span className="small">{client.email}</span>
                      <span className="cell-sub">{client.phone || 'No phone on file'}</span>
                    </td>
                    <td data-label="Location">
                      <span className="small">
                        {[client.cityMunicipality, client.province].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>
                    <td data-label="Records">
                      <div className="flex wrap gap-1">
                        <Badge tone="slate" dot={false}>{client.counts.appointments} bookings</Badge>
                        <Badge tone="slate" dot={false}>{client.counts.projects} projects</Badge>
                        <Badge tone="slate" dot={false}>{client.counts.documents} docs</Badge>
                      </div>
                    </td>
                    <td data-label="Status">
                      <Badge tone={client.isActive ? 'green' : 'slate'}>{client.isActive ? 'Active' : 'Deactivated'}</Badge>
                    </td>
                    <td data-label="Last sign-in">
                      <span className="small">{client.lastLoginAt ? relativeTime(client.lastLoginAt) : 'Never'}</span>
                    </td>
                    <td data-label="" className="cell-actions">
                      <Link className="btn btn--secondary btn--xs" to={`/admin/clients/${client.id}`}>
                        Open <Icon name="arrowRight" size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 .9rem .6rem' }}>
            <Pagination meta={data.meta} onPage={setPage} label={`${data.meta.total} client account${data.meta.total === 1 ? '' : 's'}`} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
