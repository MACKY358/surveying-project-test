import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { useAuth } from '../../auth.jsx';
import { Icon } from '../../components/Icons.jsx';
import {
  Card,
  Empty,
  ErrorState,
  Loading,
  PageHead,
  Progress,
  SectionTitle,
  Stat,
  StatusBadge,
} from '../../components/ui.jsx';
import { BookingsTrend, StageBars, ServiceBars } from '../../components/Charts.jsx';
import { appointmentPath, projectPath } from '../../components/bits.jsx';
import { dateLabel, money, relativeTime, timeLabel } from '../../utils.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get('/dashboard'), []);
  const counts = data?.counts || {};

  return (
    <>
      <PageHead
        title={`Office overview`}
        subtitle={`${dateLabel(data?.today)} · Welcome back, ${String(user?.fullName || '').split(' ')[0] || 'Administrator'}.`}
        actions={
          <>
            <Link className="btn btn--secondary" to="/admin/reports">
              <Icon name="chart" size={16} /> Reports
            </Link>
            <Link className="btn" to="/admin/appointments">
              <Icon name="calendar" size={16} /> Review requests
            </Link>
          </>
        }
      />

      {loading && !data ? <Loading label="Preparing the office dashboard…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {data ? (
        <>
          {counts.pendingRequests || counts.rescheduleRequests ? (
            <div className="notice-warning mb-2">
              <Icon name="alert" size={18} />
              <div>
                <strong>
                  {counts.pendingRequests} new request{counts.pendingRequests === 1 ? '' : 's'}
                  {counts.rescheduleRequests ? ` and ${counts.rescheduleRequests} reschedule request${counts.rescheduleRequests === 1 ? '' : 's'}` : ''}
                </strong>{' '}
                need a decision.{' '}
                <Link to="/admin/appointments">Review appointment requests</Link>
              </div>
            </div>
          ) : null}

          <div className="stat-grid mb-2">
            <Stat icon="calendar" label="Requests awaiting action" value={(counts.pendingRequests || 0) + (counts.rescheduleRequests || 0)} hint={`${counts.appointmentsToday || 0} visit(s) today`} accent />
            <Stat icon="folder" label="Active surveys" value={counts.activeSurveys ?? 0} hint={`${counts.completedSurveys ?? 0} completed`} />
            <Stat icon="clipboard" label="Documents to review" value={counts.documentsPendingReview ?? 0} hint={`${counts.documents ?? 0} on file`} />
            <Stat icon="layers" label="Plans awaiting release" value={counts.blueprintsPending ?? 0} hint="Drafts and review" />
            <Stat icon="users" label="Clients" value={counts.clients ?? 0} hint={`${counts.newClientsThisMonth ?? 0} new this month`} />
            <Stat icon="mail" label="New inquiries" value={counts.newInquiries ?? 0} hint="From the public website" />
          </div>

          <div className="split split--wide-left">
            <div className="stack">
              <Card>
                <SectionTitle
                  title="Today's field schedule"
                  sub={dateLabel(data.today)}
                  action={<Link className="link-btn small" to="/admin/calendar">Open calendar</Link>}
                />
                {data.todaysAppointments.length ? (
                  <div className="stack-sm">
                    {data.todaysAppointments.map((a) => (
                      <div key={a.id} className="panel" style={{ padding: '.65rem .8rem' }}>
                        <div className="flex items-start justify-between gap-1 wrap">
                          <div style={{ minWidth: 0 }}>
                            <div className="flex items-center gap-1 wrap">
                              <b className="small">{timeLabel(a.time)}</b>
                              <StatusBadge status={a.status} />
                              <span className="tiny mono muted">{a.referenceNo}</span>
                            </div>
                            <div className="small">{a.serviceName} · {a.clientName}</div>
                            <div className="tiny muted">
                              {a.location || [a.barangay, a.cityMunicipality].filter(Boolean).join(', ') || 'Location to be confirmed'}
                              {a.surveyorName ? ` · ${a.surveyorName}` : ' · Unassigned'}
                            </div>
                          </div>
                          <Link className="btn btn--secondary btn--xs" to={appointmentPath('admin', a.id)}>Open</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty icon="calendar" title="No field visits today" message="Bookings confirmed for today will appear here." />
                )}
              </Card>

              <Card>
                <SectionTitle title="Booking trend" sub="Last six months of requests and completions." />
                <BookingsTrend data={data.charts.monthly} />
              </Card>

              <Card>
                <SectionTitle title="Project pipeline" action={<Link className="link-btn small" to="/admin/projects">All projects</Link>} />
                <StageBars data={data.charts.stages} />
              </Card>

              <Card>
                <SectionTitle title="Upcoming confirmed visits" />
                {data.upcoming.length ? (
                  <div className="table-wrap">
                    <table className="table table--cards">
                      <thead>
                        <tr><th>Date</th><th>Service</th><th>Client</th><th>Surveyor</th><th>Status</th><th /></tr>
                      </thead>
                      <tbody>
                        {data.upcoming.map((a) => (
                          <tr key={a.id}>
                            <td data-label="Date"><span className="cell-main">{dateLabel(a.date)}</span><span className="cell-sub">{timeLabel(a.time)}</span></td>
                            <td data-label="Service"><span className="small">{a.serviceName}</span></td>
                            <td data-label="Client"><span className="small">{a.clientName}</span></td>
                            <td data-label="Surveyor"><span className="small">{a.surveyorName || 'Unassigned'}</span></td>
                            <td data-label="Status"><StatusBadge status={a.status} /></td>
                            <td data-label="" className="cell-actions"><Link className="btn btn--secondary btn--xs" to={appointmentPath('admin', a.id)}>View</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="muted small">No confirmed visits in the coming days.</p>}
              </Card>
            </div>

            <div className="detail-side">
              <Card>
                <SectionTitle title="Surveyor workload" action={<Link className="link-btn small" to="/admin/staff">Manage</Link>} />
                {data.workload.length ? (
                  <div className="stack-sm">
                    {data.workload.map((w) => (
                      <div key={w.id}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="small strong">{w.name}</span>
                          <span className="tiny muted">{w.active} active · {w.todayLoad} today</span>
                        </div>
                        <Progress value={Math.min(100, (w.active / 8) * 100)} navy />
                      </div>
                    ))}
                  </div>
                ) : <p className="muted small">No active surveyors.</p>}
              </Card>

              <Card>
                <SectionTitle title="Service demand" sub="All-time bookings by service." />
                <ServiceBars data={data.charts.services} />
              </Card>

              <Card>
                <SectionTitle title="Recent activity" action={<Link className="link-btn small" to="/admin/activity">Full log</Link>} />
                {data.activity.length ? (
                  <div className="mini-list">
                    {data.activity.map((a) => (
                      <li key={a.id} className="flex items-start gap-1">
                        <Icon name="activity" size={15} />
                        <div style={{ minWidth: 0 }}>
                          <div className="small wrap-anywhere">{a.description}</div>
                          <div className="tiny muted">{a.actor} · {relativeTime(a.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </div>
                ) : <p className="muted small">No recorded activity yet.</p>}
              </Card>

              <Card>
                <SectionTitle title="Quick actions" />
                <div className="stack-xs">
                  <Link className="btn btn--secondary btn--block" to="/admin/appointments"><Icon name="calendar" size={16} /> Review requests</Link>
                  <Link className="btn btn--secondary btn--block" to="/admin/documents"><Icon name="clipboard" size={16} /> Document review</Link>
                  <Link className="btn btn--secondary btn--block" to="/admin/blueprints"><Icon name="layers" size={16} /> Release drawings</Link>
                  <Link className="btn btn--secondary btn--block" to="/admin/inquiries"><Icon name="mail" size={16} /> Website inquiries</Link>
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
