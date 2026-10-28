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
import { appointmentPath, projectPath } from '../../components/bits.jsx';
import { dateLabel, dateTimeLabel, money, relativeTime, timeLabel } from '../../utils.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get('/dashboard'), []);

  const counts = data?.counts || {};
  const next = data?.nextAppointment;
  const firstName = String(user?.fullName || '').split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHead
        title={`${greeting}, ${firstName}`}
        subtitle="Here is what is happening with your surveys and documents."
        actions={
          <>
            <Link className="btn btn--secondary" to="/app/messages">
              <Icon name="message" size={16} /> Messages
            </Link>
            <Link className="btn" to="/app/book">
              <Icon name="calendarPlus" size={16} /> Book a survey
            </Link>
          </>
        }
      />

      {loading && !data ? <Loading label="Preparing your dashboard…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {data ? (
        <>
          <div className="stat-grid mb-2">
            <Stat icon="calendar" label="Upcoming visits" value={counts.upcoming ?? 0} hint={counts.pending ? `${counts.pending} awaiting review` : 'Confirmed and pending'} />
            <Stat icon="folder" label="Active projects" value={counts.activeProjects ?? 0} hint={`${counts.completedProjects ?? 0} completed`} accent />
            <Stat icon="file" label="Documents on file" value={counts.totalDocuments ?? 0} hint={counts.rejectedDocuments ? `${counts.rejectedDocuments} need correction` : 'All in order'} />
            <Stat icon="bell" label="Unread updates" value={counts.unread ?? 0} hint="Tap to review notifications" />
          </div>

          <div className="split split--sidebar">
            <div className="stack">
              {next ? (
                <Card className="panel--tint">
                  <div className="flex items-start justify-between gap-1 wrap">
                    <div style={{ minWidth: 0 }}>
                      <div className="tiny strong" style={{ textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--green-700)' }}>
                        Next scheduled visit
                      </div>
                      <h2 style={{ margin: '.2rem 0' }}>{next.serviceName}</h2>
                      <div className="flex wrap items-center gap-1 small">
                        <span className="strong">{dateLabel(next.date)}</span>
                        <span className="dot-sep">·</span>
                        <span>{timeLabel(next.time)}</span>
                        <StatusBadge status={next.status} />
                      </div>
                      <div className="small muted" style={{ marginTop: '.3rem' }}>
                        <Icon name="pin" size={13} /> {next.location || 'Location to be confirmed'}
                      </div>
                      {next.surveyorName ? (
                        <div className="small muted" style={{ marginTop: 2 }}>
                          <Icon name="user" size={13} /> {next.surveyorName}
                        </div>
                      ) : null}
                      <div className="tiny mono muted" style={{ marginTop: '.35rem' }}>{next.referenceNo}</div>
                    </div>
                    <Link className="btn btn--sm" to={appointmentPath('client', next.id)}>
                      View details <Icon name="arrowRight" size={14} />
                    </Link>
                  </div>
                </Card>
              ) : (
                <Card>
                  <Empty
                    icon="calendarPlus"
                    title="No upcoming visit"
                    message="Book a survey and choose a preferred date. The office will review the property details and confirm a field schedule."
                    action={<Link className="btn" to="/app/book"><Icon name="plus" size={16} /> Book a survey</Link>}
                  />
                </Card>
              )}

              <Card>
                <SectionTitle
                  title="Active projects"
                  sub="Your survey work, from fieldwork to plan release."
                  action={<Link className="link-btn small" to="/app/projects">View all</Link>}
                />
                {data.projects.length ? (
                  <div className="stack-sm">
                    {data.projects.map((project) => (
                      <Link
                        key={project.id}
                        to={projectPath('client', project.id)}
                        className="panel"
                        style={{ display: 'block', padding: '.75rem .85rem', color: 'inherit' }}
                      >
                        <div className="flex items-center justify-between gap-1 wrap">
                          <b className="small">{project.projectNo}</b>
                          <StatusBadge status={project.stage} label={project.stageLabel} />
                        </div>
                        <div className="tiny muted" style={{ margin: '.15rem 0 .35rem' }}>
                          {project.serviceName}
                          {project.lotNo ? ` · Lot ${project.lotNo}` : ''}
                          {project.location ? ` · ${project.location}` : ''}
                        </div>
                        <Progress value={project.progressPercent} showLabel />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Empty icon="folder" title="No projects yet" message="A project opens when the office approves your first booking." />
                )}
              </Card>

              <Card>
                <SectionTitle
                  title="Recent documents"
                  action={<Link className="link-btn small" to="/app/documents">Open library</Link>}
                />
                {data.recentDocuments.length ? (
                  <div className="mini-list">
                    {data.recentDocuments.map((doc) => (
                      <li key={doc.id} className="flex items-start gap-1" style={{ justifyContent: 'space-between' }}>
                        <div className="flex items-start gap-1" style={{ minWidth: 0 }}>
                          <Icon name="file" size={16} />
                          <div style={{ minWidth: 0 }}>
                            <div className="small strong wrap-anywhere">{doc.title}</div>
                            <div className="tiny muted">{doc.size} · {dateLabel(doc.createdAt)}</div>
                          </div>
                        </div>
                        <StatusBadge status={doc.status} />
                      </li>
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon="file"
                    title="No documents yet"
                    message="Upload your title, tax declaration and other requirements to keep your project moving."
                    action={<Link className="btn btn--sm" to="/app/documents">Upload a document</Link>}
                  />
                )}
              </Card>
            </div>

            <div className="detail-side">
              <Card>
                <SectionTitle title="Latest updates" action={<Link className="link-btn small" to="/app/notifications">See all</Link>} />
                {data.notifications.length ? (
                  <div className="mini-list">
                    {data.notifications.map((n) => (
                      <li key={n.id} className="flex items-start gap-1">
                        <Icon name={n.isRead ? 'bell' : 'clock'} size={15} />
                        <div style={{ minWidth: 0 }}>
                          <div className="small strong">{n.title}</div>
                          <div className="tiny muted wrap-anywhere">{n.message}</div>
                          <div className="tiny muted">{relativeTime(n.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">Office updates will appear here.</p>
                )}
              </Card>

              <Card>
                <SectionTitle title="Appointment snapshot" />
                <div className="kv-grid">
                  <div className="kv"><span>Pending review</span><b>{counts.pending ?? 0}</b></div>
                  <div className="kv"><span>Completed visits</span><b>{counts.completedAppointments ?? 0}</b></div>
                  <div className="kv"><span>Next visit</span><b>{next ? dateLabel(next.date) : '—'}</b></div>
                  <div className="kv"><span>Visit time</span><b>{next ? timeLabel(next.time) : '—'}</b></div>
                </div>
                <Link className="btn btn--secondary btn--block mt-2" to="/app/appointments">
                  <Icon name="calendar" size={16} /> All appointments
                </Link>
              </Card>

              <Card>
                <SectionTitle title="Quick actions" />
                <div className="stack-xs">
                  <Link className="btn btn--secondary btn--block" to="/app/book"><Icon name="calendarPlus" size={16} /> Book a survey</Link>
                  <Link className="btn btn--secondary btn--block" to="/app/documents"><Icon name="upload" size={16} /> Upload documents</Link>
                  <Link className="btn btn--secondary btn--block" to="/app/blueprints"><Icon name="layers" size={16} /> Survey plans</Link>
                  <Link className="btn btn--secondary btn--block" to="/app/profile"><Icon name="user" size={16} /> Update my details</Link>
                </div>
              </Card>

              {next && next.feeEstimate ? (
                <Card>
                  <SectionTitle title="Fee estimate" />
                  <div className="stat__value">{money(next.feeEstimate)}</div>
                  <p className="tiny muted">Final fees depend on the property area and fieldwork requirements. The office will confirm before work begins.</p>
                </Card>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
