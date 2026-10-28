// Shared appointment register with role-aware columns and actions.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import {
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
  Pagination,
  SearchInput,
  StatusBadge,
  Tabs,
} from './ui.jsx';
import { dateLabel, money, timeLabel } from '../utils.js';
import { appointmentPath, projectPath } from './bits.jsx';

const ADMIN_TABS = [
  { key: 'action', label: 'Needs action', statuses: 'pending,rescheduling_requested' },
  { key: 'upcoming', label: 'Upcoming', statuses: 'approved,confirmed' },
  { key: 'progress', label: 'In progress', statuses: 'in_progress' },
  { key: 'completed', label: 'Completed', statuses: 'completed' },
  { key: 'closed', label: 'Cancelled / rejected', statuses: 'cancelled,rejected' },
  { key: 'all', label: 'All', statuses: '' },
];

const CLIENT_TABS = [
  { key: 'upcoming', label: 'Upcoming', statuses: 'pending,approved,confirmed,rescheduling_requested,in_progress' },
  { key: 'completed', label: 'Completed', statuses: 'completed' },
  { key: 'closed', label: 'Cancelled', statuses: 'cancelled,rejected' },
  { key: 'all', label: 'All', statuses: '' },
];

export default function AppointmentList() {
  const { user } = useAuth();
  const role = user?.role || 'client';
  const tabs = role === 'admin' ? ADMIN_TABS : CLIENT_TABS;
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [tab, setTab] = useState(role === 'admin' ? 'action' : 'upcoming');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery.trim());
  const [serviceId, setServiceId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [q]);

  const servicesState = useAsync(() => api.get('/public/services'), []);
  const activeTab = tabs.find((t) => t.key === tab) || tabs[0];

  const { data, loading, error, reload } = useAsync(
    () =>
      api.get('/appointments', {
        page,
        pageSize: 12,
        q: debouncedQ,
        status: activeTab.statuses || undefined,
        serviceId: serviceId || undefined,
        from: from || undefined,
        to: to || undefined,
        sort: 'date',
        dir: tab === 'completed' || tab === 'closed' ? 'desc' : 'asc',
      }),
    [page, debouncedQ, tab, serviceId, from, to],
  );

  const appointments = data?.appointments || [];
  const services = servicesState.data?.services || [];
  const needsAction = tab === 'action' || (tab === 'upcoming' && role === 'admin');

  return (
    <>
      <PageHead
        title={role === 'admin' ? 'Appointment requests' : 'My appointments'}
        subtitle={
          role === 'admin'
            ? 'Review requests, assign a surveyor and confirm the field schedule.'
            : 'Track your booking requests, confirmed visits and survey history.'
        }
        actions={
          role === 'client' ? (
            <Link className="btn" to="/app/book">
              <Icon name="calendarPlus" size={16} /> Book a survey
            </Link>
          ) : (
            <Link className="btn btn--secondary" to="/admin/calendar">
              <Icon name="calendar" size={16} /> Schedule calendar
            </Link>
          )
        }
      />

      <Tabs
        tabs={tabs.map((t) => ({ key: t.key, label: t.label }))}
        value={tab}
        onChange={(next) => { setTab(next); setPage(1); }}
        ariaLabel="Appointment status filters"
      />

      <Card className="mb-2">
        <div className="filters">
          <div style={{ flex: 2 }}>
            <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search reference, client or location…" />
          </div>
          <Field label="Service" htmlFor="appt-service">
            <select id="appt-service" className="select" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPage(1); }}>
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="From" htmlFor="appt-from">
            <input id="appt-from" className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </Field>
          <Field label="To" htmlFor="appt-to">
            <input id="appt-to" className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
        </div>
      </Card>

      {loading && !data ? <Loading label="Loading appointments…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !appointments.length ? (
        <Card>
          <Empty
            icon="calendar"
            title={debouncedQ || serviceId || from || to ? 'No appointments match those filters' : needsAction ? 'Nothing needs your attention' : 'No appointments here'}
            message={
              needsAction
                ? 'New booking requests and reschedule requests will appear here.'
                : role === 'client'
                  ? 'Book a survey and the office will review your requested date and time.'
                  : 'Appointments in this category will appear here.'
            }
            action={
              role === 'client' && !debouncedQ ? (
                <Link className="btn" to="/app/book">
                  <Icon name="calendarPlus" size={16} /> Book a survey
                </Link>
              ) : null
            }
          />
        </Card>
      ) : null}

      {appointments.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Schedule</th>
                  {role === 'admin' ? <th>Client</th> : null}
                  <th>Service</th>
                  <th>Location</th>
                  {role === 'admin' ? <th>Surveyor</th> : null}
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr key={appointment.id}>
                    <td data-label="Schedule">
                      <span className="cell-main">{dateLabel(appointment.preferredDate)}</span>
                      <span className="cell-sub">{timeLabel(appointment.preferredTime)} · {appointment.durationMinutes} min</span>
                      <span className="cell-sub mono">{appointment.referenceNo}</span>
                    </td>
                    {role === 'admin' ? (
                      <td data-label="Client">
                        <span className="cell-main">{appointment.client.name}</span>
                        <span className="cell-sub">{appointment.client.phone || appointment.client.email}</span>
                      </td>
                    ) : null}
                    <td data-label="Service">
                      <span className="cell-main">{appointment.service.name}</span>
                      <span className="cell-sub">{money(appointment.feeEstimate)}</span>
                    </td>
                    <td data-label="Location">
                      <span className="small wrap-anywhere">{appointment.locationSummary || 'To be confirmed'}</span>
                      {appointment.property?.lotNo ? <span className="cell-sub">Lot {appointment.property.lotNo}</span> : null}
                    </td>
                    {role === 'admin' ? (
                      <td data-label="Surveyor">
                        {appointment.surveyor ? (
                          <span className="small">{appointment.surveyor.name}</span>
                        ) : (
                          <span className="badge badge--amber">Unassigned</span>
                        )}
                      </td>
                    ) : null}
                    <td data-label="Status">
                      <StatusBadge status={appointment.status} />
                      {appointment.rescheduleRequestedDate ? (
                        <span className="cell-sub">Wants {dateLabel(appointment.rescheduleRequestedDate)}</span>
                      ) : null}
                    </td>
                    <td data-label="" className="cell-actions">
                      <div className="table-actions">
                        <Link className="btn btn--secondary btn--xs" to={appointmentPath(role, appointment.id)}>
                          {role === 'admin' && ['pending', 'rescheduling_requested'].includes(appointment.status) ? 'Review' : 'View'}
                        </Link>
                        {appointment.project ? (
                          <Link className="btn btn--secondary btn--xs" to={projectPath(role, appointment.project.id)}>
                            <Icon name="folder" size={13} /> Project
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '.5rem 1rem' }}>
            <Pagination meta={data?.meta} onPage={setPage} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
