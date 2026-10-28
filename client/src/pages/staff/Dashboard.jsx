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
import { dateLabel, dateShort, timeLabel, todayISO } from '../../utils.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get('/dashboard'), []);
  const counts = data?.counts || {};
  const today = data?.today || todayISO();

  const weekByDate = (data?.weekSchedule || []).reduce((groups, item) => {
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
    return groups;
  }, {});

  return (
    <>
      <PageHead
        title={`Good day, ${String(user?.fullName || '').split(' ')[0] || 'Surveyor'}`}
        subtitle={`${dateLabel(today)} · Your fieldwork, assignments and office updates.`}
        actions={
          <>
            <Link className="btn btn--secondary" to="/staff/schedule">
              <Icon name="calendar" size={16} /> My schedule
            </Link>
            <Link className="btn" to="/staff/projects">
              <Icon name="folder" size={16} /> Projects
            </Link>
          </>
        }
      />

      {loading && !data ? <Loading label="Preparing your field dashboard…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {data ? (
        <>
          {counts.inProgress > 0 ? (
            <div className="notice-warning mb-2">
              <Icon name="alert" size={18} />
              <div>
                <strong>{counts.inProgress} visit{counts.inProgress === 1 ? '' : 's'} still in progress.</strong>{' '}
                Mark the appointment complete from your schedule once the fieldwork is finished.
              </div>
            </div>
          ) : null}

          <div className="stat-grid mb-2">
            <Stat icon="calendar" label="Visits today" value={counts.todayAppointments ?? 0} hint="Approved and confirmed" accent />
            <Stat icon="folder" label="Assigned projects" value={counts.activeProjects ?? 0} hint="Active fieldwork" />
            <Stat icon="clock" label="In progress" value={counts.inProgress ?? 0} hint="Waiting to be completed" />
            <Stat icon="check" label="Completed" value={counts.completed ?? 0} hint="All time" />
          </div>

          <div className="split split--wide-left">
            <div className="stack">
              <Card>
                <SectionTitle
                  title="Today's field visits"
                  sub={dateLabel(today)}
                  action={<Link className="link-btn small" to="/staff/schedule">Open schedule</Link>}
                />
                {data.todaySchedule.length ? (
                  <div className="stack-sm">
                    {data.todaySchedule.map((visit) => (
                      <div key={visit.id} className="panel" style={{ padding: '.75rem' }}>
                        <div className="flex items-start justify-between gap-1 wrap">
                          <div style={{ minWidth: 0 }}>
                            <div className="flex items-center gap-1 wrap">
                              <b className="small">{timeLabel(visit.time)}</b>
                              <StatusBadge status={visit.status} />
                              <span className="tiny mono muted">{visit.referenceNo}</span>
                            </div>
                            <div className="small">{visit.serviceName} · {visit.clientName}</div>
                            <div className="tiny muted">
                              {visit.location || 'Location to be confirmed'}
                              {visit.lotNo ? ` · Lot ${visit.lotNo}` : ''}
                            </div>
                          </div>
                          {visit.projectId ? (
                            <Link className="btn btn--secondary btn--xs" to={`/staff/projects/${visit.projectId}`}>Project</Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty icon="calendar" title="No field visits today" message="Confirmed appointments assigned to you will appear here." />
                )}
              </Card>

              <Card>
                <SectionTitle title="This week" sub="The next seven days of confirmed fieldwork." />
                {Object.keys(weekByDate).length ? (
                  <div className="stack-sm">
                    {Object.entries(weekByDate)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([day, visits]) => (
                        <div key={day}>
                          <div className="subhead">{dateLabel(day)}</div>
                          {visits.map((visit) => (
                            <div key={visit.id} className="flex items-start justify-between gap-1" style={{ padding: '.35rem 0' }}>
                              <div style={{ minWidth: 0 }}>
                                <div className="small">
                                  <b>{timeLabel(visit.time)}</b> · {visit.serviceName}
                                </div>
                                <div className="tiny muted">{visit.clientName}{visit.location ? ` · ${visit.location}` : ''}</div>
                              </div>
                              {visit.projectId ? (
                                <Link className="link-btn tiny" to={`/staff/projects/${visit.projectId}`}>Open</Link>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                ) : (
                  <Empty icon="calendar" title="Your week is clear" message="New confirmed assignments will show up here." />
                )}
              </Card>

              <Card>
                <SectionTitle
                  title="Active projects"
                  action={<Link className="link-btn small" to="/staff/projects">All projects</Link>}
                />
                {data.projects.length ? (
                  <div className="stack-sm">
                    {data.projects.slice(0, 6).map((project) => (
                      <div key={project.id} className="panel" style={{ padding: '.65rem .8rem' }}>
                        <div className="flex items-start justify-between gap-1 wrap">
                          <div style={{ minWidth: 0 }}>
                            <Link className="link-btn small mono" to={`/staff/projects/${project.id}`}>{project.projectNo}</Link>
                            <div className="tiny muted">{project.serviceName} · {project.clientName}</div>
                            <div className="tiny muted">
                              {project.location || 'No location recorded'}
                              {project.targetCompletionDate ? ` · Target ${dateShort(project.targetCompletionDate)}` : ''}
                            </div>
                          </div>
                          <StatusBadge status={project.stage} label={project.stageLabel} />
                        </div>
                        <div className="mt-1">
                          <Progress value={project.progressPercent} showLabel />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty icon="folder" title="No assigned projects" message="Projects appear once an administrator assigns you as lead or team member." />
                )}
              </Card>
            </div>

            <div className="detail-side">
              <Card>
                <SectionTitle title="Quick actions" />
                <div className="stack-xs">
                  <Link className="btn btn--secondary btn--block" to="/staff/schedule"><Icon name="calendar" size={16} /> View my schedule</Link>
                  <Link className="btn btn--secondary btn--block" to="/staff/projects"><Icon name="folder" size={16} /> Open assigned projects</Link>
                  <Link className="btn btn--secondary btn--block" to="/staff/messages"><Icon name="message" size={16} /> Message the office</Link>
                  <Link className="btn btn--secondary btn--block" to="/staff/notifications">
                    <Icon name="bell" size={16} /> Notifications{counts.unread ? ` (${counts.unread})` : ''}
                  </Link>
                </div>
              </Card>

              <Card>
                <SectionTitle title="Field reminders" />
                <ul className="mini-list">
                  <li>
                    <Icon name="clock" size={16} />
                    <div>
                      <div className="small strong">Start and complete visits</div>
                      <div className="tiny muted">Update the appointment status from your schedule so the office sees progress.</div>
                    </div>
                  </li>
                  <li>
                    <Icon name="alert" size={16} />
                    <div>
                      <div className="small strong">Report conflicts early</div>
                      <div className="tiny muted">Overlapping or inaccessible sites can be reported to the administrator in one tap.</div>
                    </div>
                  </li>
                  <li>
                    <Icon name="shield" size={16} />
                    <div>
                      <div className="small strong">Protect client data</div>
                      <div className="tiny muted">Only open records for projects assigned to you. Do not download files to shared devices.</div>
                    </div>
                  </li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
