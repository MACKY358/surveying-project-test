import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import Calendar from '../../components/Calendar.jsx';
import {
  Alert,
  Card,
  Empty,
  Field,
  Loading,
  ErrorState,
  Modal,
  PageHead,
  SectionTitle,
  StatusBadge,
  useConfirm,
  useToast,
} from '../../components/ui.jsx';
import { appointmentPath, projectPath } from '../../components/bits.jsx';
import {
  addDaysISO,
  dateLabel,
  dateLong,
  endOfMonthISO,
  endOfWeekISO,
  startOfMonthISO,
  startOfWeekISO,
  timeLabel,
  todayISO,
} from '../../utils.js';

function rangeFor(view, date) {
  if (view === 'day') return { from: date, to: date };
  if (view === 'week') return { from: startOfWeekISO(date), to: endOfWeekISO(date) };
  if (view === 'agenda') return { from: date, to: addDaysISO(date, 60) };
  return { from: startOfWeekISO(startOfMonthISO(date)), to: endOfWeekISO(endOfMonthISO(date)) };
}

export default function AdminCalendar() {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState('month');
  const [date, setDate] = useState(todayISO());
  const [surveyorId, setSurveyorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [status, setStatus] = useState('all');
  const [location, setLocation] = useState('');
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const range = useMemo(() => rangeFor(view, date), [view, date]);

  const servicesState = useAsync(() => api.get('/public/services'), []);
  const projectsState = useAsync(() => api.get('/projects', { pageSize: 100 }), []);
  const { data, loading, error, reload } = useAsync(
    () =>
      api.get('/calendar', {
        from: range.from,
        to: range.to,
        surveyorId: surveyorId || undefined,
        serviceId: serviceId || undefined,
        status,
        location: location || undefined,
      }),
    [range.from, range.to, surveyorId, serviceId, status, location],
  );

  const events = data?.events || [];
  const surveyors = data?.surveyors || [];
  const services = servicesState.data?.services || [];
  const projects = projectsState.data?.projects || [];

  async function removeSchedule(entry) {
    const ok = await confirm({
      title: 'Remove schedule entry',
      message: `"${entry.title}" will be removed from the calendar. Appointment bookings are not affected.`,
      confirmLabel: 'Remove entry',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/calendar/schedules/${entry.scheduleId}`);
      toast.success('Schedule entry removed.');
      setSelected(null);
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <PageHead
        title="Schedule calendar"
        subtitle="Every confirmed field visit, office task and drawing review in one place."
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => reload(true)}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
            <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={16} /> Add schedule entry
            </button>
          </>
        }
      />

      <Card className="mb-2">
        <div className="filters">
          <Field label="Surveyor" htmlFor="cal-surveyor">
            <select id="cal-surveyor" className="select" value={surveyorId} onChange={(e) => setSurveyorId(e.target.value)}>
              <option value="">All surveyors</option>
              {surveyors.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.fullName || s.name}</option>)}
            </select>
          </Field>
          <Field label="Service" htmlFor="cal-service">
            <select id="cal-service" className="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">All services</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status" htmlFor="cal-status">
            <select id="cal-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="scheduled">Scheduled (manual)</option>
            </select>
          </Field>
          <Field label="Location" htmlFor="cal-location">
            <input id="cal-location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Brgy. or town" />
          </Field>
        </div>
      </Card>

      {data?.conflicts?.length ? (
        <Alert tone="danger" title={`${data.conflicts.length} schedule overlap${data.conflicts.length === 1 ? '' : 's'} detected`}>
          {data.conflicts.map((c) => (
            <div key={`${c.a}-${c.b}`} className="small">
              {c.staffName} has overlapping bookings on {dateLabel(c.date)}. Open the entries below to resolve the assignment.
            </div>
          ))}
        </Alert>
      ) : null}

      {loading && !data ? <Loading label="Loading the calendar…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {data ? (
        <Card flush>
          <div style={{ padding: '.75rem' }}>
            <Calendar
              events={events}
              date={date}
              view={view}
              onDateChange={setDate}
              onViewChange={setView}
              onSelectEvent={setSelected}
              onSelectDate={(day) => setDate(day)}
            />
          </div>
        </Card>
      ) : null}

      <div className="split split--wide-left mt-2">
        <Card>
          <SectionTitle title="What the colours mean" />
          <div className="flex wrap gap-1">
            {[
              ['green', 'Confirmed / scheduled'],
              ['blue', 'Approved'],
              ['amber', 'Pending review'],
              ['teal', 'Fieldwork in progress'],
              ['violet', 'Reschedule requested'],
              ['slate', 'Completed / manual office task'],
              ['red', 'Cancelled / conflict'],
            ].map(([tone, label]) => (
              <span key={tone} className="flex items-center gap-1 small">
                <i className={`event-bar event-bar--${tone}`} style={{ display: 'inline-block', width: 8, height: 18 }} />
                {label}
              </span>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Legend notes" />
          <p className="tiny muted" style={{ margin: 0 }}>
            Only approved, confirmed and in-progress bookings block a public slot. Pending requests do not hold the calendar, but they
            appear here so the office can plan ahead.
          </p>
        </Card>
      </div>

      {selected ? (
        <EventModal
          event={selected}
          onClose={() => setSelected(null)}
          onDeleteSchedule={removeSchedule}
        />
      ) : null}

      {createOpen ? (
        <CreateScheduleModal
          projects={projects}
          surveyors={surveyors}
          defaultDate={date}
          onClose={() => setCreateOpen(false)}
          onDone={async () => { setCreateOpen(false); await reload(true); }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Event details                                                       */
/* ------------------------------------------------------------------ */
function EventModal({ event, onClose, onDeleteSchedule }) {
  const isAppointment = event.kind === 'appointment';
  return (
    <Modal
      open
      onClose={onClose}
      title={event.title}
      subtitle={event.subtitle}
      footer={
        <>
          {event.projectId ? (
            <Link className="btn btn--secondary" to={projectPath('admin', event.projectId)} onClick={onClose}>
              <Icon name="folder" size={15} /> Open project
            </Link>
          ) : null}
          {isAppointment ? (
            <Link className="btn" to={appointmentPath('admin', event.appointmentId)} onClick={onClose}>
              <Icon name="calendar" size={15} /> Appointment details
            </Link>
          ) : (
            <button type="button" className="btn btn--danger-soft" onClick={() => onDeleteSchedule(event)}>
              <Icon name="trash" size={15} /> Remove entry
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={onClose}>Close</button>
        </>
      }
    >
      <div className="flex items-center gap-1 wrap mb-2">
        <StatusBadge status={event.status} />
        <span className="badge badge--slate">{isAppointment ? 'Client booking' : 'Office schedule'}</span>
      </div>
      <div className="kv-grid">
        <div className="kv"><span>Date</span><b>{dateLabel(event.date)}</b></div>
        <div className="kv"><span>Time</span><b>{timeLabel(String(event.start).slice(11, 16))}{event.end ? ` – ${timeLabel(String(event.end).slice(11, 16))}` : ''}</b></div>
        <div className="kv"><span>Service</span><b>{event.serviceName || '—'}</b></div>
        <div className="kv"><span>Surveyor</span><b>{event.surveyor?.name || 'Unassigned'}</b></div>
        {event.referenceNo ? <div className="kv"><span>Reference</span><b className="mono">{event.referenceNo}</b></div> : null}
        {event.projectNo ? <div className="kv"><span>Project</span><b>{event.projectNo}</b></div> : null}
        {event.clientName ? <div className="kv"><span>Client</span><b>{event.clientName}</b></div> : null}
      </div>
      {event.location ? (
        <p className="small" style={{ marginTop: '.8rem' }}>
          <Icon name="pin" size={14} /> {event.location}
        </p>
      ) : null}
      {isAppointment ? (
        <Alert tone="info" title="Changing this booking">
          Use the appointment details page to reschedule, reassign a surveyor or cancel. That keeps the client notification and audit
          trail intact.
        </Alert>
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Manual schedule entry                                               */
/* ------------------------------------------------------------------ */
function CreateScheduleModal({ projects, surveyors, defaultDate, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    projectId: '',
    staffId: '',
    scheduleType: 'fieldwork',
    title: '',
    date: defaultDate,
    startTime: '08:00',
    endTime: '10:00',
    location: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const result = await api.post('/calendar/schedules', {
        projectId: Number(form.projectId),
        staffId: form.staffId ? Number(form.staffId) : null,
        scheduleType: form.scheduleType,
        title: form.title.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success(result.message || 'Schedule entry added.');
      onDone();
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
      title="Add a schedule entry"
      subtitle="Use this for fieldwork blocks, office work, plan reviews or meetings."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="schedule-form" className="btn" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Add to calendar
          </button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not add the schedule entry">{error}</Alert> : null}
        <Field label="Project" htmlFor="sched-project" required error={fields.projectId}>
          <select id="sched-project" className="select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required>
            <option value="">Select a project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.projectNo} — {p.client.name}</option>)}
          </select>
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="Staff member" htmlFor="sched-staff" error={fields.staffId} hint="Optional — leave blank for office-wide work.">
            <select id="sched-staff" className="select" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
              <option value="">Unassigned</option>
              {surveyors.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.fullName || s.name}</option>)}
            </select>
          </Field>
          <Field label="Entry type" htmlFor="sched-type">
            <select id="sched-type" className="select" value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}>
              <option value="fieldwork">Fieldwork</option>
              <option value="office_work">Office work</option>
              <option value="review">Plan review</option>
              <option value="meeting">Meeting</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Title" htmlFor="sched-title" required error={fields.title}>
          <input id="sched-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Boundary verification — Lot 12" maxLength={160} required />
        </Field>
        <div className="form-grid form-grid--3">
          <Field label="Date" htmlFor="sched-date" required error={fields.date}>
            <input id="sched-date" className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="Start" htmlFor="sched-start" required error={fields.startTime}>
            <input id="sched-start" className="input" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
          </Field>
          <Field label="End" htmlFor="sched-end" required error={fields.endTime}>
            <input id="sched-end" className="input" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
          </Field>
        </div>
        <Field label="Location" htmlFor="sched-location" error={fields.location}>
          <input id="sched-location" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={255} />
        </Field>
        <Field label="Notes" htmlFor="sched-notes" error={fields.notes}>
          <textarea id="sched-notes" className="textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}
