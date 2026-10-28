import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import Calendar from '../../components/Calendar.jsx';
import { mapsUrl, projectPath } from '../../components/bits.jsx';
import {
  Alert,
  Badge,
  Card,
  ErrorState,
  Field,
  InfoRow,
  Loading,
  Modal,
  PageHead,
  SectionTitle,
  StatusBadge,
  useConfirm,
  useToast,
} from '../../components/ui.jsx';
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

const STATUS_COLOR = {
  approved: 'blue',
  confirmed: 'green',
  in_progress: 'teal',
  completed: 'slate',
  cancelled: 'slate',
  pending: 'amber',
};

function rangeFor(view, date) {
  if (view === 'day') return { from: date, to: date };
  if (view === 'week') return { from: startOfWeekISO(date), to: endOfWeekISO(date) };
  if (view === 'agenda') return { from: date, to: addDaysISO(date, 60) };
  return { from: startOfWeekISO(startOfMonthISO(date)), to: endOfWeekISO(endOfMonthISO(date)) };
}

function ConflictModal({ open, onClose, appointments, target, onReported }) {
  const toast = useToast();
  const [appointmentId, setAppointmentId] = useState(target?.appointmentId || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (message.trim().length < 10) {
      setError('Describe the conflict in a little more detail (at least 10 characters).');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await api.post('/staff/conflicts', {
        appointmentId: appointmentId ? Number(appointmentId) : null,
        message: message.trim(),
      });
      toast.success(result.message || 'Conflict reported to the office.');
      onReported();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Report a schedule conflict"
      subtitle="The administrator receives an in-app alert. Field notes are attached to the project when one exists."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="conflict-form" className="btn btn--danger" disabled={busy}>
            {busy ? 'Sending…' : 'Report conflict'}
          </button>
        </>
      }
    >
      <form id="conflict-form" onSubmit={submit}>
        <Field label="Related appointment (optional)" htmlFor="conflict-appointment">
          <select id="conflict-appointment" className="select" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>
            <option value="">Not linked to a specific booking</option>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                {dateLabel(appointment.date)} · {timeLabel(appointment.time)} · {appointment.client?.name} · {appointment.serviceName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What is the problem?" htmlFor="conflict-message" required error={error}>
          <textarea
            id="conflict-message"
            className="textarea"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            placeholder="For example: two confirmed visits overlap at 9:00 AM, or the property gate was locked and access needs rescheduling."
            required
          />
        </Field>
        <Alert tone="info">
          For emergencies or same-day changes, also call the office. This message creates an in-app alert and audit entry.
        </Alert>
      </form>
    </Modal>
  );
}

export default function Schedule() {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState('month');
  const [date, setDate] = useState(todayISO());
  const [selected, setSelected] = useState(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictTarget, setConflictTarget] = useState(null);
  const [busyAction, setBusyAction] = useState('');

  const range = useMemo(() => rangeFor(view, date), [view, date]);
  const { data, loading, error, reload } = useAsync(
    () => api.get('/staff/schedule', { from: range.from, to: range.to }),
    [range.from, range.to],
  );

  const appointments = data?.appointments || [];
  const schedules = data?.schedules || [];

  const events = useMemo(() => {
    const appointmentEvents = appointments.map((appointment) => ({
      id: `appt-${appointment.id}`,
      eventType: 'appointment',
      appointmentId: appointment.id,
      title: `${timeLabel(appointment.time)} ${appointment.serviceName}`,
      subtitle: appointment.client.name,
      location: appointment.location,
      status: appointment.status,
      color: STATUS_COLOR[appointment.status] || 'amber',
      date: appointment.date,
      start: `${appointment.date} ${appointment.time}`,
      raw: appointment,
    }));
    const manualEvents = schedules.map((entry) => ({
      id: `sched-${entry.id}`,
      eventType: 'manual',
      title: entry.title,
      subtitle: [entry.projectNo, entry.serviceName].filter(Boolean).join(' · '),
      location: entry.location,
      status: entry.status,
      color: entry.status === 'cancelled' ? 'red' : 'slate',
      date: String(entry.startsAt).slice(0, 10),
      start: entry.startsAt,
      end: entry.endsAt,
      raw: entry,
    }));
    return [...appointmentEvents, ...manualEvents];
  }, [appointments, schedules]);

  async function updateVisit(action) {
    if (!selected || selected.eventType !== 'appointment') return;
    const appointmentId = selected.appointmentId;
    const starting = action === 'start';
    const ok = await confirm({
      title: starting ? 'Start this field visit?' : 'Mark this visit complete?',
      message: starting
        ? 'This marks the survey as in progress and notifies the client. Only start when the team is on site.'
        : 'This closes the field visit and notifies the office that the survey work is done. Project stages are updated separately.',
      confirmLabel: starting ? 'Start visit' : 'Complete visit',
    });
    if (!ok) return;
    setBusyAction(action);
    try {
      const result = await api.patch(`/appointments/${appointmentId}/decision`, { action });
      toast.success(result.message || (starting ? 'Visit started.' : 'Visit completed.'));
      setSelected(null);
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyAction('');
    }
  }

  function openConflict(target) {
    setConflictTarget(target);
    setConflictOpen(true);
  }

  return (
    <>
      <PageHead
        title="My schedule"
        subtitle="Confirmed field visits and office assignments assigned to you."
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => reload(true)} disabled={loading}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
            <button type="button" className="btn btn--danger-soft" onClick={() => openConflict(null)}>
              <Icon name="alert" size={16} /> Report a conflict
            </button>
          </>
        }
      />

      {loading && !data ? <Loading label="Loading your schedule…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {data ? (
        <>
          <div className="flex wrap items-center gap-1 mb-2">
            <Badge tone="green" dot>Confirmed visit</Badge>
            <Badge tone="teal" dot>In progress</Badge>
            <Badge tone="blue" dot>Approved</Badge>
            <Badge tone="slate" dot>Office task</Badge>
            <span className="tiny muted">{appointments.length} visit{appointments.length === 1 ? '' : 's'} · {schedules.length} office entr{schedules.length === 1 ? 'y' : 'ies'}</span>
          </div>

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

          <Card className="mt-2">
            <SectionTitle
              title="Upcoming visits in view"
              sub={`${dateLabel(range.from)} to ${dateLabel(range.to)}`}
            />
            {appointments.length ? (
              <div className="stack-sm">
                {appointments.map((appointment) => (
                  <div key={appointment.id} className="panel" style={{ padding: '.7rem .8rem' }}>
                    <div className="flex items-start justify-between gap-1 wrap">
                      <div style={{ minWidth: 0 }}>
                        <div className="flex items-center gap-1 wrap">
                          <b className="small">{dateLabel(appointment.date)} · {timeLabel(appointment.time)}</b>
                          <StatusBadge status={appointment.status} />
                        </div>
                        <div className="small">{appointment.serviceName} · {appointment.client.name}</div>
                        <div className="tiny muted">{appointment.location || 'Location to be confirmed'}</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn--secondary btn--xs"
                        onClick={() => {
                          const found = events.find((event) => event.id === `appt-${appointment.id}`);
                          if (found) setSelected(found);
                        }}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>No visits scheduled in this period.</p>
            )}
          </Card>
        </>
      ) : null}

      {selected ? (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={selected.eventType === 'appointment' ? selected.raw.serviceName : selected.raw.title}
          subtitle={dateLong(selected.date)}
          size="wide"
          footer={
            <>
              <button type="button" className="btn btn--secondary" onClick={() => setSelected(null)}>Close</button>
              {selected.eventType === 'appointment' && selected.raw.project ? (
                <Link className="btn btn--secondary" to={projectPath('surveyor', selected.raw.project.id)}>Open project</Link>
              ) : null}
              {selected.eventType === 'appointment' && ['approved', 'confirmed'].includes(selected.raw.status) ? (
                <button type="button" className="btn" onClick={() => updateVisit('start')} disabled={!!busyAction}>
                  <Icon name="clock" size={16} /> {busyAction === 'start' ? 'Starting…' : 'Start visit'}
                </button>
              ) : null}
              {selected.eventType === 'appointment' && selected.raw.status === 'in_progress' ? (
                <button type="button" className="btn" onClick={() => updateVisit('complete')} disabled={!!busyAction}>
                  <Icon name="check" size={16} /> {busyAction === 'complete' ? 'Completing…' : 'Complete visit'}
                </button>
              ) : null}
            </>
          }
        >
          {selected.eventType === 'appointment' ? (
            <>
              <div className="flex items-center gap-1 wrap mb-2">
                <StatusBadge status={selected.raw.status} />
                <Badge tone="slate" dot={false}>{selected.raw.referenceNo || 'No reference'}</Badge>
                <Badge tone="slate" dot={false}>{timeLabel(selected.raw.time)} · {selected.raw.durationMinutes} minutes</Badge>
              </div>

              <div className="kv-grid mb-2">
                <div className="kv"><span>Client</span><b>{selected.raw.client.name}</b></div>
                <div className="kv">
                  <span>Client phone</span>
                  <b>{selected.raw.client.phone || 'Not provided'}</b>
                </div>
                <div className="kv"><span>Service</span><b>{selected.raw.serviceName}</b></div>
                <div className="kv"><span>Project</span><b>{selected.raw.project?.projectNo || 'Not created yet'}</b></div>
              </div>

              <div className="panel mb-2">
                <div className="subhead">Site address</div>
                <p className="small" style={{ margin: 0 }}>
                  {[
                    selected.raw.property?.addressLine,
                    selected.raw.property?.barangay && `Brgy. ${selected.raw.property.barangay}`,
                    selected.raw.property?.cityMunicipality,
                    selected.raw.property?.province,
                  ].filter(Boolean).join(', ') || selected.raw.location || 'No address recorded'}
                </p>
                {selected.raw.location ? (
                  <a className="link-btn small mt-1" href={mapsUrl(selected.raw.location)} target="_blank" rel="noreferrer">
                    <Icon name="map" size={14} /> Open in maps
                  </a>
                ) : null}
                <div className="kv-grid mt-2">
                  <div className="kv"><span>Lot</span><b>{selected.raw.property?.lotNo || '—'}</b></div>
                  <div className="kv"><span>Block</span><b>{selected.raw.property?.blockNo || '—'}</b></div>
                  <div className="kv"><span>Area</span><b>{selected.raw.property?.areaSqm ? `${Number(selected.raw.property.areaSqm).toLocaleString('en-PH')} sqm` : '—'}</b></div>
                  <div className="kv"><span>Title no.</span><b>{selected.raw.property?.titleNo || '—'}</b></div>
                  <div className="kv"><span>Tax declaration</span><b>{selected.raw.property?.taxDeclarationNo || '—'}</b></div>
                  <div className="kv"><span>Duration</span><b>{selected.raw.durationMinutes} minutes</b></div>
                </div>
              </div>

              {selected.raw.clientNotes ? (
                <div className="panel panel--tint mb-2">
                  <div className="subhead">Client notes</div>
                  <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selected.raw.clientNotes}</p>
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn--danger-soft btn--sm"
                onClick={() => openConflict({ appointmentId: selected.appointmentId })}
              >
                <Icon name="alert" size={15} /> Report a problem with this visit
              </button>
            </>
          ) : (
            <>
              <InfoRow label="When">
                {dateLabel(selected.date)} · {timeLabel(String(selected.start).slice(11, 16))}
                {selected.end ? ` – ${timeLabel(String(selected.end).slice(11, 16))}` : ''}
              </InfoRow>
              <InfoRow label="Project">{selected.raw.projectNo || '—'}</InfoRow>
              <InfoRow label="Service">{selected.raw.serviceName || '—'}</InfoRow>
              <InfoRow label="Location">{selected.raw.location || '—'}</InfoRow>
              <InfoRow label="Status"><StatusBadge status={selected.raw.status} /></InfoRow>
              {selected.raw.notes ? (
                <div className="panel mt-2">
                  <div className="subhead">Notes</div>
                  <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selected.raw.notes}</p>
                </div>
              ) : null}
            </>
          )}
        </Modal>
      ) : null}

      {conflictOpen ? (
        <ConflictModal
          open={conflictOpen}
          onClose={() => setConflictOpen(false)}
          appointments={appointments}
          target={conflictTarget}
          onReported={() => reload(true)}
        />
      ) : null}
    </>
  );
}
