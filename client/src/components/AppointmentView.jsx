import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, downloadApiFile, fileUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAsync } from '../hooks.js';
import {
  Alert,
  Badge,
  Card,
  Dropzone,
  Empty,
  ErrorState,
  Field,
  InfoRow,
  Loading,
  Modal,
  PageHead,
  Person,
  Progress,
  SectionTitle,
  StatusBadge,
  useConfirm,
  useToast,
} from './ui.jsx';
import { Icon } from './Icons.jsx';
import Viewer from './Viewer.jsx';
import { appointmentPath, docTone, mapsUrl, projectPath, requirementIcon } from './bits.jsx';
import {
  addDaysISO,
  cn,
  copyText,
  dateLabel,
  dateLong,
  dateTimeLabel,
  money,
  relativeTime,
  timeLabel,
  todayISO,
} from '../utils.js';

function statusHint(status) {
  switch (status) {
    case 'pending':
      return 'The office has received this request and will review the property details before assigning a surveyor.';
    case 'approved':
      return 'A surveyor has been assigned. The office will confirm the final schedule.';
    case 'confirmed':
      return 'Your field visit is confirmed. Please make sure someone can access the property.';
    case 'rescheduling_requested':
      return 'The office is reviewing your reschedule request.';
    case 'in_progress':
      return 'The field team is working on this survey.';
    case 'completed':
      return 'Fieldwork is complete. The project continues through data processing and document release.';
    case 'rejected':
      return 'This request was not approved. You can book a new request with corrected details.';
    case 'cancelled':
      return 'This appointment was cancelled.';
    default:
      return '';
  }
}

export default function AppointmentView({ id }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const role = user.role;

  const { data, error, loading, reload } = useAsync(() => api.get(`/appointments/${id}`), [id]);
  const checklistState = useAsync(() => api.get(`/appointments/${id}/checklist`), [id]);
  const staffState = useAsync(
    () => (role === 'admin' ? api.get('/admin/staff') : Promise.resolve({ staff: [] })),
    [role],
  );

  const [viewDoc, setViewDoc] = useState(null);
  const [uploadReq, setUploadReq] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');

  const appointment = data?.appointment;
  const documents = data?.documents || [];
  const schedule = data?.schedule || [];
  const checklist = checklistState.data?.checklist || [];
  const surveyors = (staffState.data?.staff || []).filter((s) => s.role === 'surveyor' && s.isActive);

  const required = checklist.filter((item) => item.isRequired);
  const missingRequired = required.filter((item) => item.status === 'missing').length;
  const rejectedRequired = required.filter((item) => item.status === 'rejected').length;

  async function runDecision(action, payload = {}, successMessage) {
    setBusy(action);
    setActionError('');
    try {
      const result = await api.patch(`/appointments/${id}/decision`, { action, ...payload });
      toast.success(result.message || successMessage || 'Appointment updated.');
      setScheduleModal(null);
      setRejectOpen(false);
      await reload(true);
      checklistState.reload(true).catch(() => {});
      return true;
    } catch (err) {
      setActionError(err.message);
      toast.error(err.message, 'Could not update the appointment');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function cancelAppointment() {
    const ok = await confirm({
      title: 'Cancel this appointment?',
      message:
        'The appointment and any linked field schedule will be cancelled. The office is notified and the record stays visible in history.',
      confirmLabel: 'Cancel appointment',
      danger: true,
    });
    if (!ok) return;
    if (role === 'client') {
      setBusy('cancel');
      try {
        const result = await api.patch(`/appointments/${id}/cancel`, { reason: 'Cancelled by the client.' });
        toast.success(result.message || 'Appointment cancelled.');
        await reload(true);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setBusy('');
      }
    } else {
      await runDecision('cancel', { reason: 'Cancelled by the office.' });
    }
  }

  async function saveNotes(form) {
    setBusy('notes');
    try {
      await api.patch(`/appointments/${id}`, form);
      toast.success('Internal notes and fee updated.');
      setNotesOpen(false);
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  }

  async function removeAttachment(doc) {
    const ok = await confirm({
      title: 'Remove attachment?',
      message: `Remove "${doc.originalName}" from this booking request? This cannot be undone.`,
      confirmLabel: 'Remove file',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/documents/${doc.id}`);
      toast.success('Attachment removed.');
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function copyReference() {
    const ok = await copyText(appointment.referenceNo);
    if (ok) toast.success('Reference number copied.', 'Copied');
    else toast.error('Could not copy the reference. Select it manually.');
  }

  if (loading) return <Loading label="Opening appointment…" />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!appointment) return <Empty title="Appointment not found" message="This record may have been removed." />;

  const isTerminal = ['completed', 'cancelled', 'rejected'].includes(appointment.status);
  const canClientChange = role === 'client' && !isTerminal;
  const canApprove = role === 'admin' && ['pending', 'rescheduling_requested'].includes(appointment.status);
  const canConfirm = role === 'admin' && appointment.status === 'approved';
  const canReschedule = role === 'admin' && !['completed', 'cancelled', 'rejected'].includes(appointment.status);
  const canStart =
    (role === 'admin' || role === 'surveyor') && ['approved', 'confirmed'].includes(appointment.status);
  const canComplete =
    (role === 'admin' || role === 'surveyor') && appointment.status === 'in_progress';
  const canCancel = role === 'admin' && !isTerminal;

  return (
    <>
      <PageHead
        title={`Appointment ${appointment.referenceNo}`}
        subtitle={`${appointment.service.name} · requested ${relativeTime(appointment.createdAt)}`}
        back={{ onClick: () => navigate(-1), label: role === 'client' ? 'My appointments' : 'Appointments' }}
        actions={
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={copyReference}>
              <Icon name="copy" size={15} /> Copy reference
            </button>
            {appointment.project ? (
              <Link to={projectPath(role, appointment.project.id)} className="btn btn--sm">
                <Icon name="folder" size={15} /> Open project
              </Link>
            ) : null}
          </>
        }
      />

      <div className="detail-head-meta mb-2">
        <StatusBadge status={appointment.status} />
        <Badge tone="slate" dot={false}><Icon name="calendar" size={12} /> {dateLong(appointment.preferredDate)}</Badge>
        <Badge tone="slate" dot={false}><Icon name="clock" size={12} /> {timeLabel(appointment.preferredTime)}</Badge>
        {appointment.surveyor ? <Badge tone="teal" dot={false}><Icon name="user" size={12} /> {appointment.surveyor.name}</Badge> : null}
        {appointment.project ? <Badge tone="navy" dot={false}>{appointment.project.projectNo}</Badge> : null}
      </div>

      {statusHint(appointment.status) ? <Alert tone="info">{statusHint(appointment.status)}</Alert> : null}

      {appointment.status === 'rejected' && appointment.rejectionReason ? (
        <div className="mt-2">
          <Alert tone="danger" title="Reason for rejection">{appointment.rejectionReason}</Alert>
        </div>
      ) : null}
      {appointment.status === 'cancelled' && appointment.cancellationReason ? (
        <div className="mt-2">
          <Alert tone="warn" title="Cancellation reason">{appointment.cancellationReason}</Alert>
        </div>
      ) : null}
      {appointment.status === 'rescheduling_requested' ? (
        <div className="mt-2">
          <Alert tone="warn" title="Reschedule requested">
            Requested new schedule: {dateLabel(appointment.rescheduleRequestedDate)} at{' '}
            {timeLabel(appointment.rescheduleRequestedTime)}.
            {appointment.rescheduleReason ? ` Reason: ${appointment.rescheduleReason}` : ''}
          </Alert>
        </div>
      ) : null}

      <div className="split split--wide-left mt-2">
        <div className="stack">
          <Card>
            <div className="card__head">
              <div>
                <h2>Visit details</h2>
                <p className="sub">What the field team will need on the day.</p>
              </div>
              <span className="badge badge--slate">{appointment.durationMinutes} minutes</span>
            </div>
            <div className="kv-grid">
              <div className="kv"><span>Service</span><b>{appointment.service.name}</b></div>
              <div className="kv"><span>Reference</span><b className="mono">{appointment.referenceNo}</b></div>
              <div className="kv"><span>Date</span><b>{dateLong(appointment.preferredDate)}</b></div>
              <div className="kv"><span>Time</span><b>{timeLabel(appointment.preferredTime)} – {timeLabel(endTime(appointment.preferredTime, appointment.durationMinutes))}</b></div>
              <div className="kv"><span>Surveyor</span><b>{appointment.surveyor?.name || 'To be assigned'}</b></div>
              <div className="kv"><span>Fee estimate</span><b>{money(appointment.feeEstimate)}</b></div>
              <div className="kv" style={{ gridColumn: '1 / -1' }}>
                <span>Location</span>
                <b>{appointment.locationSummary || [appointment.property?.barangay, appointment.property?.cityMunicipality, appointment.property?.province].filter(Boolean).join(', ') || '—'}</b>
              </div>
              {appointment.property?.lotNo ? (
                <div className="kv"><span>Lot / block</span><b>{appointment.property.lotNo}{appointment.property.blockNo ? ` · Blk ${appointment.property.blockNo}` : ''}</b></div>
              ) : null}
              {appointment.locationSummary ? (
                <div className="kv">
                  <span>Directions</span>
                  <b><a href={mapsUrl(appointment.locationSummary)} target="_blank" rel="noreferrer noopener">Open in maps <Icon name="external" size={12} /></a></b>
                </div>
              ) : null}
            </div>
            {appointment.clientNotes ? (
              <div className="mt-2">
                <div className="subhead">Client notes</div>
                <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{appointment.clientNotes}</p>
              </div>
            ) : null}
            {role !== 'client' && appointment.adminNotes ? (
              <div className="mt-2">
                <div className="subhead">Office notes</div>
                <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{appointment.adminNotes}</p>
              </div>
            ) : null}
          </Card>

          {role !== 'client' ? (
            <Card>
              <div className="card__head">
                <div>
                  <h2>Client</h2>
                  <p className="sub">Contact details for the field visit.</p>
                </div>
              </div>
              <Person name={appointment.client.name} meta={appointment.client.email} size="lg">
                <div className="btn-row mt-1">
                  <a className="btn btn--secondary btn--xs" href={`tel:${appointment.client.phone || ''}`}><Icon name="phone" size={14} /> Call</a>
                  <a className="btn btn--secondary btn--xs" href={`mailto:${appointment.client.email}`}><Icon name="mail" size={14} /> Email</a>
                  <a className="btn btn--ghost btn--xs" href={`sms:${appointment.client.phone || ''}`}><Icon name="message" size={14} /> SMS</a>
                </div>
              </Person>
              <div className="kv-grid mt-2">
                <div className="kv"><span>Phone</span><b>{appointment.client.phone || '—'}</b></div>
                <div className="kv"><span>Email</span><b className="wrap-anywhere">{appointment.client.email}</b></div>
              </div>
            </Card>
          ) : null}

          <Card>
            <SectionTitle
              title="Document checklist"
              sub={
                checklistState.loading
                  ? 'Checking requirements…'
                  : `${checklist.filter((c) => c.status === 'approved').length} of ${checklist.length} requirement(s) approved`
              }
            />
            {missingRequired || rejectedRequired ? (
              <Alert tone={rejectedRequired ? 'danger' : 'warn'} title={rejectedRequired ? 'Some documents need correction' : 'Required documents are missing'}>
                {rejectedRequired ? `${rejectedRequired} required document(s) were rejected. Review the office note and upload a replacement.` : `${missingRequired} required document(s) still need to be uploaded.`}
              </Alert>
            ) : null}
            {checklistState.loading ? <Loading label="Loading checklist…" /> : null}
            {!checklistState.loading && !checklist.length ? (
              <p className="small muted">No document requirements are configured for this service.</p>
            ) : null}
            <div className="mt-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={cn('requirement-row', item.status === 'approved' && 'requirement-row--approved', item.status === 'rejected' && 'requirement-row--rejected')}
                >
                  <span
                    className={cn('check-row__icon', item.status === 'approved' ? 'ok' : item.status === 'rejected' ? 'bad' : 'wait')}
                    style={{ marginTop: 2, color: item.status === 'approved' ? 'var(--green-600)' : item.status === 'rejected' ? 'var(--red-600)' : 'var(--amber-600)' }}
                  >
                    <Icon name={requirementIcon(item.status)} size={18} />
                  </span>
                  <div className="requirement-row__body">
                    <div className="flex items-center gap-1 wrap">
                      <strong className="small">{item.name}</strong>
                      {item.isRequired ? <span className="badge badge--slate">Required</span> : null}
                      <Badge tone={docTone(item.status)}>{item.status === 'submitted' ? 'Submitted' : item.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    {item.description ? <div className="tiny muted" style={{ marginTop: 2 }}>{item.description}</div> : null}
                    <div className="tiny muted">
                      {item.allowedTypes?.length ? `Accepts ${item.allowedTypes.join(', ')}` : 'Any supported file type'} · up to {item.maxSizeMb} MB
                    </div>
                    {item.status !== 'approved' && role === 'client' ? (
                      <button type="button" className="btn btn--secondary btn--xs mt-1" onClick={() => setUploadReq(item)}>
                        <Icon name="upload" size={13} /> {item.status === 'missing' ? 'Upload' : 'Replace'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {documents.length ? (
            <Card>
              <SectionTitle title="Booking attachments" sub="Files submitted with the original request." />
              <div className="stack-sm">
                {documents.map((doc) => (
                  <button key={doc.id} type="button" className="attachment-link" onClick={() => setViewDoc(doc)} style={{ width: '100%', textAlign: 'left' }}>
                    <Icon name="file" size={17} />
                    <b>{doc.originalName}</b>
                    <span className="muted tiny" style={{ marginLeft: 'auto' }}>{doc.size}</span>
                    <Icon name="eye" size={15} />
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          {schedule.length ? (
            <Card>
              <SectionTitle title="Field schedule" sub="Entries created by the office for this appointment." />
              <ul className="timeline">
                {schedule.map((item) => (
                  <li key={item.id} className={item.status === 'completed' ? 'done' : 'current'}>
                    <div className="timeline__title">{item.title}</div>
                    <div className="timeline__meta">
                      {dateTimeLabel(item.startsAt)} – {String(item.endsAt || '').slice(11, 16)}
                      {item.staffName ? ` · ${item.staffName}` : ''}
                    </div>
                    <div className="timeline__note">
                      <StatusBadge status={item.status} /> {item.location ? ` · ${item.location}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="detail-side">
          <Card>
            <SectionTitle title="Actions" />
            <div className="stack-sm">
              {canApprove ? (
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => {
                    setActionError('');
                    setScheduleModal({ mode: appointment.status === 'rescheduling_requested' ? 'resolve' : 'approve' });
                  }}
                >
                  <Icon name="userCheck" size={16} /> {appointment.status === 'rescheduling_requested' ? 'Resolve reschedule request' : 'Approve & assign surveyor'}
                </button>
              ) : null}
              {canConfirm ? (
                <button
                  type="button"
                  className="btn btn--block"
                  disabled={busy === 'confirm'}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Confirm this booking?',
                      message: 'The client is notified that the field visit is confirmed. Make sure the assigned surveyor and schedule are final.',
                      confirmLabel: 'Confirm booking',
                    });
                    if (ok) runDecision('confirm', {}, 'Appointment confirmed.');
                  }}
                >
                  {busy === 'confirm' ? <span className="spinner" /> : <Icon name="check" size={16} />} Confirm booking
                </button>
              ) : null}
              {canStart ? (
                <button
                  type="button"
                  className="btn btn--block"
                  disabled={busy === 'start'}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Start fieldwork?',
                      message: 'This marks the survey as in progress and notifies the client. Use it when the team is on site.',
                      confirmLabel: 'Start fieldwork',
                    });
                    if (ok) runDecision('start', {}, 'Fieldwork started.');
                  }}
                >
                  {busy === 'start' ? <span className="spinner" /> : <Icon name="compass" size={16} />} Start fieldwork
                </button>
              ) : null}
              {canComplete ? (
                <button
                  type="button"
                  className="btn btn--block"
                  disabled={busy === 'complete'}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Mark fieldwork complete?',
                      message: 'The appointment will be completed and the project moved to data processing. Add field notes first if measurements still need recording.',
                      confirmLabel: 'Complete fieldwork',
                    });
                    if (ok) runDecision('complete', {}, 'Fieldwork completed.');
                  }}
                >
                  {busy === 'complete' ? <span className="spinner" /> : <Icon name="check" size={16} />} Complete fieldwork
                </button>
              ) : null}
              {canReschedule ? (
                <button
                  type="button"
                  className="btn btn--secondary btn--block"
                  onClick={() => {
                    setActionError('');
                    setScheduleModal({ mode: 'reschedule' });
                  }}
                >
                  <Icon name="calendar" size={16} /> Reschedule
                </button>
              ) : null}
              {canClientChange ? (
                <button type="button" className="btn btn--secondary btn--block" onClick={() => setScheduleModal({ mode: 'client' })}>
                  <Icon name="calendar" size={16} /> Request a new schedule
                </button>
              ) : null}
              {role === 'admin' ? (
                <button type="button" className="btn btn--ghost btn--block" onClick={() => setNotesOpen(true)}>
                  <Icon name="edit" size={16} /> Edit office notes / fee
                </button>
              ) : null}
              {canCancel || canClientChange ? (
                <button type="button" className="btn btn--danger-soft btn--block" onClick={cancelAppointment} disabled={busy === 'cancel'}>
                  <Icon name="close" size={16} /> Cancel appointment
                </button>
              ) : null}
              {isTerminal && role === 'client' && appointment.status === 'rejected' ? (
                <Link to="/app/book" className="btn btn--block"><Icon name="calendarPlus" size={16} /> Book again</Link>
              ) : null}
              {isTerminal && !(role === 'client' && appointment.status === 'rejected') ? (
                <p className="small muted" style={{ margin: 0 }}>No further actions are available for a {appointment.status} appointment.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <SectionTitle title="Timeline" />
            <ul className="timeline">
              <li className="done">
                <div className="timeline__title">Request submitted</div>
                <div className="timeline__meta">{dateTimeLabel(appointment.createdAt)}</div>
              </li>
              {appointment.approvedAt ? (
                <li className="done">
                  <div className="timeline__title">Approved</div>
                  <div className="timeline__meta">{dateTimeLabel(appointment.approvedAt)}</div>
                </li>
              ) : null}
              {appointment.confirmedAt ? (
                <li className="done">
                  <div className="timeline__title">Confirmed</div>
                  <div className="timeline__meta">{dateTimeLabel(appointment.confirmedAt)}</div>
                </li>
              ) : null}
              {appointment.startedAt ? (
                <li className={appointment.completedAt ? 'done' : 'current'}>
                  <div className="timeline__title">Fieldwork started</div>
                  <div className="timeline__meta">{dateTimeLabel(appointment.startedAt)}</div>
                </li>
              ) : null}
              {appointment.completedAt ? (
                <li className="done">
                  <div className="timeline__title">Fieldwork completed</div>
                  <div className="timeline__meta">{dateTimeLabel(appointment.completedAt)}</div>
                </li>
              ) : null}
              {appointment.cancelledAt ? (
                <li>
                  <div className="timeline__title">Cancelled</div>
                  <div className="timeline__meta">{dateTimeLabel(appointment.cancelledAt)}</div>
                </li>
              ) : null}
            </ul>
          </Card>

          {appointment.project ? (
            <Card>
              <SectionTitle title="Project progress" />
              <div className="small strong">{appointment.project.projectNo}</div>
              <div className="tiny muted mb-1">{appointment.project.stageLabel}</div>
              <Progress value={appointment.project.progressPercent} showLabel />
              <Link to={projectPath(role, appointment.project.id)} className="btn btn--secondary btn--sm btn--block mt-2">
                View project <Icon name="arrowRight" size={14} />
              </Link>
            </Card>
          ) : null}

          <Card>
            <SectionTitle title="Need help?" />
            <p className="small muted">
              Call the office at <a href="tel:+63458614420">(045) 861-4420</a> or send a message from your inbox. Portal
              messages are not monitored outside business hours.
            </p>
            {role !== 'client' ? (
              <div className="tiny muted">
                Requested {dateTimeLabel(appointment.createdAt)} · last updated {dateTimeLabel(appointment.updatedAt)}
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      {viewDoc ? (
        <Modal open onClose={() => setViewDoc(null)} title={viewDoc.originalName || viewDoc.title} subtitle={`${viewDoc.size || ''} · uploaded ${relativeTime(viewDoc.createdAt)}`} size="wide">
          <Viewer
            src={fileUrl(`/appointments/documents/${viewDoc.id}/file`)}
            mimeType={viewDoc.mimeType}
            name={viewDoc.originalName || viewDoc.title}
            height="62vh"
            onClose={() => setViewDoc(null)}
            onDownload={() =>
              downloadApiFile(`/appointments/documents/${viewDoc.id}/file`, viewDoc.originalName, { download: 1 }).catch((err) =>
                toast.error(err.message),
              )
            }
          />
          {role === 'client' && !['approved', 'under_review'].includes(viewDoc.status) ? (
            <div className="mt-2">
              <button type="button" className="btn btn--danger-soft btn--sm" onClick={() => { setViewDoc(null); removeAttachment(viewDoc); }}>
                <Icon name="trash" size={14} /> Remove attachment
              </button>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {uploadReq ? (
        <RequirementUpload
          requirement={uploadReq}
          appointmentId={appointment.id}
          onClose={() => setUploadReq(null)}
          onDone={async () => {
            setUploadReq(null);
            await Promise.all([checklistState.reload(true), reload(true)]);
          }}
        />
      ) : null}

      {scheduleModal ? (
        scheduleModal.mode === 'client' ? (
          <ClientRescheduleModal
            appointment={appointment}
            onClose={() => setScheduleModal(null)}
            onDone={async () => {
              setScheduleModal(null);
              await reload(true);
            }}
          />
        ) : (
          <StaffScheduleModal
            mode={scheduleModal.mode}
            appointment={appointment}
            surveyors={surveyors}
            error={actionError}
            busy={busy}
            onClose={() => setScheduleModal(null)}
            onSubmit={(payload) => {
              const action = scheduleModal.mode === 'resolve' ? 'resolve_reschedule' : scheduleModal.mode === 'approve' ? 'approve' : 'reschedule';
              return runDecision(action, payload);
            }}
          />
        )
      ) : null}

      {rejectOpen ? (
        <RejectModal
          busy={busy === 'reject'}
          error={actionError}
          onClose={() => setRejectOpen(false)}
          onSubmit={(reason) => runDecision('reject', { reason })}
        />
      ) : null}

      {notesOpen ? (
        <NotesModal
          appointment={appointment}
          busy={busy === 'notes'}
          onClose={() => setNotesOpen(false)}
          onSubmit={saveNotes}
        />
      ) : null}
    </>
  );
}

function endTime(time, duration) {
  if (!time) return '';
  const [h, m] = String(time).split(':').map(Number);
  const total = h * 60 + m + (Number(duration) || 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

function RequirementUpload({ requirement, appointmentId, onClose, onDone }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!files.length) {
      setError('Choose a file to upload.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('appointmentId', String(appointmentId));
      form.append('requirementId', String(requirement.id));
      files.forEach((file) => form.append('files', file));
      const result = await api.upload('/documents', form);
      toast.success(result.message || 'Document uploaded.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Upload: ${requirement.name}`}
      subtitle="The office reviews each upload before it counts as complete."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="req-upload-form" className="btn" disabled={busy || !files.length}>
            {busy ? <span className="spinner" /> : <Icon name="upload" size={15} />} {busy ? 'Uploading…' : 'Upload document'}
          </button>
        </>
      }
    >
      <form id="req-upload-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Upload failed">{error}</Alert> : null}
        <p className="small muted">
          {requirement.description || 'Attach a clear scan or photo of the document.'}
        </p>
        <Dropzone
          files={files}
          onFiles={setFiles}
          multiple={false}
          accept={(requirement.allowedTypes || []).map((t) => `.${t}`).join(',')}
          maxMb={requirement.maxSizeMb}
          label="Choose the document"
          hint={`Accepted: ${(requirement.allowedTypes || ['pdf', 'jpg', 'png']).join(', ')} · up to ${requirement.maxSizeMb} MB`}
        />
      </form>
    </Modal>
  );
}

function StaffScheduleModal({ mode, appointment, surveyors, error, busy, onClose, onSubmit }) {
  const requestedDate = appointment.rescheduleRequestedDate || appointment.preferredDate;
  const requestedTime = appointment.rescheduleRequestedTime || appointment.preferredTime;
  const [form, setForm] = useState({
    surveyorId: appointment.surveyor?.id ? String(appointment.surveyor.id) : '',
    date: requestedDate || addDaysISO(todayISO(), 1),
    time: String(requestedTime || '09:00:00').slice(0, 8),
    note: '',
  });

  const title =
    mode === 'approve' ? 'Approve & assign surveyor' : mode === 'resolve' ? 'Resolve reschedule request' : 'Reschedule appointment';
  const submitLabel = mode === 'approve' ? 'Approve appointment' : mode === 'resolve' ? 'Confirm new schedule' : 'Save new schedule';

  function submit(event) {
    event.preventDefault();
    onSubmit({
      surveyorId: Number(form.surveyorId) || undefined,
      date: form.date,
      time: form.time,
      note: form.note || undefined,
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={`${appointment.referenceNo} · ${appointment.service.name}`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="staff-schedule-form" className="btn" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} {submitLabel}
          </button>
        </>
      }
    >
      <form id="staff-schedule-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not save the schedule">{error}</Alert> : null}
        <Alert tone="info">
          The server checks the surveyor's existing bookings and the client's other appointments. A clash blocks the change.
        </Alert>
        <div className="field mt-2">
          <label className="field__label" htmlFor="assign-surveyor">Assigned surveyor <span className="req">*</span></label>
          <select id="assign-surveyor" className="select" value={form.surveyorId} onChange={(e) => setForm({ ...form, surveyorId: e.target.value })} required>
            <option value="">Select a surveyor…</option>
            {surveyors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}{s.position ? ` — ${s.position}` : ''}{!s.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid form-grid--2">
          <div className="field">
            <label className="field__label" htmlFor="assign-date">Date <span className="req">*</span></label>
            <input id="assign-date" className="input" type="date" value={form.date} min={addDaysISO(todayISO(), 1)} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="assign-time">Start time <span className="req">*</span></label>
            <input id="assign-time" className="input" type="time" step="900" value={form.time.slice(0, 5)} onChange={(e) => setForm({ ...form, time: `${e.target.value}:00` })} required />
          </div>
        </div>
        <Field label="Internal note (optional)" htmlFor="assign-note">
          <textarea id="assign-note" className="textarea" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Why is the schedule changing?" />
        </Field>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          The client and surveyor receive an in-portal notification. Automated email or SMS is not configured.
        </p>
      </form>
    </Modal>
  );
}

function ClientRescheduleModal({ appointment, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(addDaysISO(todayISO(), 1));
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [day, setDay] = useState(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoadingDay(true);
    setTime('');
    api
      .get('/public/availability', { serviceId: appointment.service.id, date })
      .then((data) => {
        if (alive) setDay(data);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoadingDay(false);
      });
    return () => {
      alive = false;
    };
  }, [date, appointment.service.id]);

  async function submit(event) {
    event.preventDefault();
    if (!time) {
      setError('Choose an available time slot.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.patch(`/appointments/${appointment.id}/reschedule`, { date, time, reason });
      toast.success(result.message || 'Reschedule request sent.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const slots = day?.slots || [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Request a new schedule"
      subtitle={`${appointment.referenceNo} · current: ${dateLabel(appointment.preferredDate)} at ${timeLabel(appointment.preferredTime)}`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="client-reschedule-form" className="btn" disabled={busy || !time}>
            {busy ? <span className="spinner" /> : <Icon name="send" size={15} />} Send request
          </button>
        </>
      }
    >
      <form id="client-reschedule-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not request the change">{error}</Alert> : null}
        <Alert tone="info">
          This sends a request. The office confirms the new schedule after checking surveyor availability. Your original slot
          remains visible until then.
        </Alert>
        <div className="field mt-2">
          <label className="field__label" htmlFor="resched-date">Preferred date <span className="req">*</span></label>
          <input id="resched-date" className="input" type="date" min={addDaysISO(todayISO(), 1)} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {loadingDay ? <Loading label="Checking available slots…" /> : null}
        {!loadingDay && day?.closed ? <Alert tone="warn">{day.reason || 'The office is closed on that date.'}</Alert> : null}
        {!loadingDay && !day?.closed && slots.length ? (
          <div className="field">
            <span className="field__label">Available start times <span className="req">*</span></span>
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  className={cn('slot', time === slot.time && 'active')}
                  disabled={!slot.available}
                  title={slot.available ? `Until ${timeLabel(slot.endTime)}` : slot.reason}
                  onClick={() => setTime(slot.time)}
                >
                  {timeLabel(slot.time)}
                </button>
              ))}
            </div>
            <div className="field__hint">Slots already booked by the office or blocked by office hours are unavailable.</div>
          </div>
        ) : null}
        <div className="field">
          <label className="field__label" htmlFor="resched-reason">Reason <span className="req">*</span></label>
          <textarea id="resched-reason" className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Tell the office why the schedule needs to change." />
        </div>
      </form>
    </Modal>
  );
}

function RejectModal({ busy, error, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title="Reject appointment request"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="reject-form" className="btn btn--danger" disabled={busy || reason.trim().length < 3}>
            {busy ? <span className="spinner" /> : <Icon name="close" size={15} />} Reject request
          </button>
        </>
      }
    >
      <form id="reject-form" onSubmit={(e) => { e.preventDefault(); onSubmit(reason.trim()); }}>
        {error ? <Alert tone="danger" title="Could not reject the request">{error}</Alert> : null}
        <p className="small muted">The client sees this reason in their portal. Automated email is not configured, so the office should also call if the matter is urgent.</p>
        <div className="field">
          <label className="field__label" htmlFor="reject-reason">Reason <span className="req">*</span></label>
          <textarea id="reject-reason" className="textarea" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. The submitted title does not cover the lot described. Please upload the correct document." />
        </div>
      </form>
    </Modal>
  );
}

function NotesModal({ appointment, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({
    adminNotes: appointment.adminNotes || '',
    feeEstimate: appointment.feeEstimate ?? '',
    durationMinutes: appointment.durationMinutes || 120,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Office notes and fee"
      subtitle="Internal notes are not shown to the client."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="notes-form" className="btn" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Save changes
          </button>
        </>
      }
    >
      <form id="notes-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ adminNotes: form.adminNotes, feeEstimate: form.feeEstimate === '' ? null : Number(form.feeEstimate), durationMinutes: Number(form.durationMinutes) }); }}>
        <Field label="Internal notes" htmlFor="admin-notes" hint="Visible to administrators and assigned surveyors only.">
          <textarea id="admin-notes" className="textarea" rows={5} value={form.adminNotes} onChange={(e) => setForm({ ...form, adminNotes: e.target.value })} />
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="Fee estimate (PHP)" htmlFor="fee-estimate">
            <input id="fee-estimate" className="input" type="number" min="0" step="0.01" value={form.feeEstimate} onChange={(e) => setForm({ ...form, feeEstimate: e.target.value })} />
          </Field>
          <Field label="Duration (minutes)" htmlFor="duration-minutes">
            <input id="duration-minutes" className="input" type="number" min="30" max="600" step="15" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
