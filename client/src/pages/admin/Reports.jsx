import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadApiFile } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
  SectionTitle,
  Stat,
  StatusBadge,
  useToast,
  Badge,
} from '../../components/ui.jsx';
import {
  DocStatusBars,
  MonthlyBars,
  ServiceBars,
  StatusDonut,
  WeekdayBars,
  WorkloadMini,
} from '../../components/Charts.jsx';
import {
  addDaysISO,
  dateLabel,
  money,
  number,
  startOfMonthISO,
  stageTone,
  timeLabel,
  todayISO,
} from '../../utils.js';

const EXPORTS = [
  { type: 'appointments', label: 'Appointments', icon: 'calendar' },
  { type: 'clients', label: 'New clients', icon: 'users' },
  { type: 'workload', label: 'Surveyor workload', icon: 'briefcase' },
  { type: 'documents', label: 'Documents', icon: 'file' },
  { type: 'services', label: 'Service demand', icon: 'chart' },
  { type: 'projects', label: 'Projects', icon: 'folder' },
];

const PRESETS = [
  { key: '30', label: 'Last 30 days', range: () => ({ from: addDaysISO(todayISO(), -29), to: todayISO() }) },
  { key: '90', label: 'Last 90 days', range: () => ({ from: addDaysISO(todayISO(), -89), to: todayISO() }) },
  { key: 'month', label: 'This month', range: () => ({ from: startOfMonthISO(todayISO()), to: todayISO() }) },
  { key: 'ytd', label: 'Year to date', range: () => ({ from: `${todayISO().slice(0, 4)}-01-01`, to: todayISO() }) },
];

export default function Reports() {
  const toast = useToast();
  const initial = PRESETS[0].range();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busyExport, setBusyExport] = useState('');

  const { data, loading, error, reload } = useAsync(() => api.get('/admin/reports', { from, to }), [from, to]);

  const summary = data?.summary;
  const charts = data?.charts || {};

  function applyPreset(preset) {
    const range = preset.range();
    setFrom(range.from);
    setTo(range.to);
  }

  async function exportCsv(type) {
    setBusyExport(type);
    try {
      await downloadApiFile('/admin/reports/export', null, { type, from, to });
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} CSV downloaded.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyExport('');
    }
  }

  const rangeValid = from && to && from <= to;

  return (
    <>
      <PageHead
        title="Reports & exports"
        subtitle={`Office performance from ${dateLabel(from)} to ${dateLabel(to)}.`}
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => window.print()}>
              <Icon name="printer" size={16} /> Print
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => reload()} disabled={loading}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
          </>
        }
      />

      <Card className="mb-2 no-print">
        <div className="filters">
          <Field label="From" htmlFor="report-from">
            <input id="report-from" className="input" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To" htmlFor="report-to">
            <input id="report-to" className="input" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <div className="flex items-end" style={{ flexWrap: 'wrap', gap: '.35rem' }}>
            {PRESETS.map((preset) => (
              <button key={preset.key} type="button" className="btn btn--secondary btn--sm" onClick={() => applyPreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        {!rangeValid ? <p className="field__error" style={{ marginBottom: 0 }}>Choose a start date on or before the end date.</p> : null}
      </Card>

      {loading && !data ? <Loading label="Building your report…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}
      {!rangeValid ? null : (
        <>
          {data ? (
            <>
              <div className="stat-grid stat-grid--6 mb-2">
                <Stat icon="calendar" label="Appointments" value={number(summary.appointments)} hint={`${summary.completionRate}% completed`} accent />
                <Stat icon="check" label="Completed" value={number(summary.completed)} hint={`${money(summary.completedValue)} completed value`} />
                <Stat icon="clock" label="Pending" value={number(summary.pending)} hint="Awaiting a decision" />
                <Stat icon="users" label="New clients" value={number(summary.newClients)} hint="Registered in period" />
                <Stat icon="folder" label="Active projects" value={number(summary.activeProjects)} hint={`${summary.completedProjects} completed overall`} />
                <Stat icon="file" label="Documents added" value={number(summary.documentsUploaded)} hint={`${summary.documentsPending} awaiting review`} />
              </div>

              <div className="split split--wide-left mb-2">
                <Card>
                  <SectionTitle title="Appointment volume" sub="Requests, completions and cancellations by month." />
                  <MonthlyBars data={charts.byMonth} />
                </Card>
                <Card>
                  <SectionTitle title="Status mix" sub="Every request in the selected period." />
                  {charts.byStatus?.length ? <StatusDonut data={charts.byStatus} /> : <Empty icon="chart" title="No appointments in range" />}
                </Card>
              </div>

              <div className="split split--wide-left mb-2">
                <Card>
                  <SectionTitle title="Service demand" sub="Bookings and estimated value by service." />
                  <ServiceBars data={charts.byService?.filter((service) => service.total > 0)} />
                  <div className="table-wrap mt-2">
                    <table className="table table--cards">
                      <thead>
                        <tr><th>Service</th><th>Bookings</th><th>Completed</th><th>Estimated value</th></tr>
                      </thead>
                      <tbody>
                        {charts.byService?.map((service) => (
                          <tr key={service.name}>
                            <td data-label="Service"><span className="cell-main small">{service.name}</span></td>
                            <td data-label="Bookings"><span className="small">{service.total}</span></td>
                            <td data-label="Completed"><span className="small">{service.completed}</span></td>
                            <td data-label="Estimated value"><span className="small">{money(service.value)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <div className="detail-side">
                  <Card>
                    <SectionTitle title="Busiest weekdays" />
                    <WeekdayBars data={charts.byWeekday} />
                  </Card>
                  <Card>
                    <SectionTitle title="Document status" sub="All documents currently on file." />
                    <DocStatusBars data={charts.documents} />
                  </Card>
                </div>
              </div>

              <div className="split split--wide-left mb-2">
                <Card>
                  <SectionTitle title="Surveyor workload" sub="Assignments in the selected period and active load today." />
                  {data.workload.length ? (
                    <>
                      <WorkloadMini data={data.workload} />
                      <div className="table-wrap mt-2">
                        <table className="table table--cards">
                          <thead>
                            <tr><th>Surveyor</th><th>In period</th><th>Completed</th><th>Active now</th><th>Project leads</th></tr>
                          </thead>
                          <tbody>
                            {data.workload.map((person) => (
                              <tr key={person.id}>
                                <td data-label="Surveyor">
                                  <span className="cell-main small">{person.name}</span>
                                  <span className="cell-sub">{person.position || 'Surveyor'}</span>
                                </td>
                                <td data-label="In period"><span className="small">{person.total}</span></td>
                                <td data-label="Completed"><span className="small">{person.completed}</span></td>
                                <td data-label="Active now"><span className="small">{person.active}</span></td>
                                <td data-label="Project leads"><span className="small">{person.leadProjects}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : <Empty icon="briefcase" title="No surveyor records" />}
                </Card>

                <Card>
                  <SectionTitle title="Overdue projects" sub="Target completion dates already passed." />
                  {data.overdue.length ? (
                    <div className="stack-sm">
                      {data.overdue.map((project) => (
                        <div key={project.id} className="panel" style={{ padding: '.6rem .75rem' }}>
                          <div className="flex items-start justify-between gap-1 wrap">
                            <div style={{ minWidth: 0 }}>
                              <Link className="link-btn small mono" to={`/admin/projects/${project.id}`}>{project.projectNo}</Link>
                              <div className="tiny muted">{project.clientName} · {project.serviceName}</div>
                            </div>
                            <Badge tone="red">{project.daysOverdue} day{project.daysOverdue === 1 ? '' : 's'} late</Badge>
                          </div>
                          <div className="flex items-center justify-between gap-1 wrap mt-1">
                            <Badge tone={stageTone(project.stage)}>{project.stageLabel}</Badge>
                            <span className="tiny muted">Target {dateLabel(project.targetCompletionDate)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty icon="check" title="No overdue projects" message="Every active project is inside its target completion date." />
                  )}
                </Card>
              </div>

              <Card className="mb-2">
                <SectionTitle
                  title="New client registrations"
                  sub={`${data.clients.length} account${data.clients.length === 1 ? '' : 's'} created in this period.`}
                />
                {data.clients.length ? (
                  <div className="table-wrap">
                    <table className="table table--cards">
                      <thead>
                        <tr><th>Client</th><th>Contact</th><th>Location</th><th>Appointments</th><th>Projects</th><th>Registered</th></tr>
                      </thead>
                      <tbody>
                        {data.clients.map((client) => (
                          <tr key={client.id}>
                            <td data-label="Client">
                              <Link className="cell-main small" to={`/admin/clients/${client.id}`}>{client.fullName}</Link>
                            </td>
                            <td data-label="Contact">
                              <span className="small">{client.email}</span>
                              <span className="cell-sub">{client.phone || '—'}</span>
                            </td>
                            <td data-label="Location"><span className="small">{[client.cityMunicipality, client.province].filter(Boolean).join(', ') || '—'}</span></td>
                            <td data-label="Appointments"><span className="small">{client.appointments}</span></td>
                            <td data-label="Projects"><span className="small">{client.projects}</span></td>
                            <td data-label="Registered"><span className="small">{dateLabel(client.createdAt)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty icon="users" title="No new clients" message="No accounts were registered in this date range." />}
              </Card>

              <Card className="mb-2">
                <SectionTitle title="Appointment register" sub="Every request with a preferred date inside the range." />
                {data.appointments.length ? (
                  <div className="table-wrap">
                    <table className="table table--cards">
                      <thead>
                        <tr><th>Reference</th><th>Date</th><th>Service</th><th>Client</th><th>Surveyor</th><th>Fee</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {data.appointments.map((appointment) => (
                          <tr key={appointment.id}>
                            <td data-label="Reference">
                              <Link className="cell-main mono tiny" to={`/admin/appointments/${appointment.id}`}>{appointment.referenceNo}</Link>
                            </td>
                            <td data-label="Date">
                              <span className="small">{dateLabel(appointment.date)}</span>
                              <span className="cell-sub">{timeLabel(appointment.time)}</span>
                            </td>
                            <td data-label="Service"><span className="small">{appointment.serviceName}</span></td>
                            <td data-label="Client"><span className="small">{appointment.clientName}</span></td>
                            <td data-label="Surveyor"><span className="small">{appointment.surveyorName || 'Unassigned'}</span></td>
                            <td data-label="Fee"><span className="small">{money(appointment.fee)}</span></td>
                            <td data-label="Status"><StatusBadge status={appointment.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty icon="calendar" title="No appointments" message="No appointments were requested in this date range." />}
              </Card>
            </>
          ) : null}
        </>
      )}

      <Card className="no-print">
        <SectionTitle
          title="Download CSV data"
          sub="Exports respect the selected date range and are recorded in the activity log."
        />
        <div className="flex wrap gap-1">
          {EXPORTS.map((item) => (
            <button
              key={item.type}
              type="button"
              className="btn btn--secondary"
              onClick={() => exportCsv(item.type)}
              disabled={!rangeValid || busyExport === item.type}
            >
              <Icon name={busyExport === item.type ? 'refresh' : 'download'} size={16} />
              {item.label}
            </button>
          ))}
        </div>
        <p className="tiny muted" style={{ marginBottom: 0, marginTop: '.7rem' }}>
          Files open in Excel, Google Sheets or LibreOffice. Personal data in these exports is covered by the office privacy
          policy — store downloads securely and delete them when no longer needed.
        </p>
      </Card>
    </>
  );
}
