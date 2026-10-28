import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, downloadApiFile, fileUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAsync } from '../hooks.js';
import {
  Alert,
  Badge,
  Card,
  Divider,
  Dropzone,
  Empty,
  ErrorState,
  Field,
  InfoRow,
  Loading,
  Modal,
  PageHead,
  Progress,
  SectionTitle,
  StatusBadge,
  Tabs,
  useConfirm,
  useToast,
} from './ui.jsx';
import { Icon } from './Icons.jsx';
import Viewer from './Viewer.jsx';
import BlueprintModal, { CreateBlueprintModal } from './BlueprintModal.jsx';
import { appointmentPath, docTone, mapsUrl } from './bits.jsx';
import {
  bytesLabel,
  cn,
  dateLabel,
  dateLong,
  dateTimeLabel,
  isPdf,
  money,
  relativeTime,
  stageTone,
  timeLabel,
  titleCase,
  todayISO,
} from '../utils.js';

const NOTE_TYPES = [
  { key: 'note', label: 'General note' },
  { key: 'measurement', label: 'Measurement' },
  { key: 'issue', label: 'Issue on site' },
  { key: 'follow_up', label: 'Follow-up needed' },
  { key: 'completion', label: 'Completion note' },
];

function noteTone(type) {
  if (type === 'issue') return 'red';
  if (type === 'follow_up') return 'amber';
  if (type === 'measurement') return 'blue';
  if (type === 'completion') return 'green';
  return 'slate';
}

export default function ProjectView({ id }) {
  const { user } = useAuth();
  const role = user.role;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const { data, error, loading, reload } = useAsync(() => api.get(`/projects/${id}`), [id]);
  const [tab, setTab] = useState('overview');
  const [stageOpen, setStageOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [reviewDoc, setReviewDoc] = useState(null);
  const [openBlueprint, setOpenBlueprint] = useState(null);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');

  const project = data?.project;
  const stages = data?.stages || [];
  const permissions = data?.permissions || {};
  const documents = data?.documents || [];
  const blueprints = data?.blueprints || [];
  const assignments = data?.assignments || [];
  const history = data?.history || [];
  const fieldNotes = data?.fieldNotes || [];

  const currentStageIndex = useMemo(
    () => stages.findIndex((s) => s.key === project?.stage),
    [stages, project?.stage],
  );

  async function run(fn, success, label) {
    setBusy(label);
    setActionError('');
    try {
      await fn();
      toast.success(success);
      await reload(true);
      return true;
    } catch (err) {
      setActionError(err.message);
      toast.error(err.message, 'Could not save the change');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function updateStage(form) {
    const ok = await run(
      () => api.patch(`/projects/${id}/stage`, form),
      'Project progress updated. The client was notified.',
      'stage',
    );
    if (ok) setStageOpen(false);
  }

  async function addNote(form) {
    const ok = await run(() => api.post(`/projects/${id}/notes`, form), 'Field note saved.', 'note');
    if (ok) setNoteOpen(false);
  }

  async function assignStaff(form) {
    const ok = await run(
      () => api.post(`/projects/${id}/assignments`, form),
      'Staff member assigned to the project.',
      'assign',
    );
    if (ok) setAssignOpen(false);
  }

  async function unassign(a) {
    const ok = await confirm({
      title: 'Remove from project?',
      message: `${a.name} will lose access to this project's working files. The assignment is kept in history.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) await run(() => api.del(`/projects/${id}/assignments/${a.id}`), 'Staff member removed.', 'unassign');
  }

  async function archive() {
    const ok = await confirm({
      title: 'Archive this project?',
      message: 'Only completed projects can be archived. Archived records remain searchable by the office but disappear from client views.',
      confirmLabel: 'Archive project',
      danger: true,
    });
    if (ok) await run(() => api.post(`/projects/${id}/archive`), 'Project archived.', 'archive');
  }

  async function restore() {
    const ok = await run(() => api.post(`/projects/${id}/restore`), 'Project restored.', 'restore');
    if (ok) navigate(0);
  }

  if (loading) return <Loading label="Opening project record…" />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!project) return <Empty title="Project not found" message="This record may have been archived or removed." />;

  const archived = !!project.archivedAt;
  const isComplete = project.stage === 'completed';
  const canStage = permissions.canUpdateProgress && !archived;
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'dashboard' },
    { key: 'progress', label: 'Progress', icon: 'activity', count: undefined },
    { key: 'documents', label: 'Documents', icon: 'file', count: documents.length },
    { key: 'drawings', label: 'Survey plans', icon: 'layers', count: blueprints.length },
    ...(role !== 'client' ? [{ key: 'notes', label: 'Field notes', icon: 'edit', count: fieldNotes.length }] : []),
    ...(role === 'admin' ? [{ key: 'team', label: 'Team', icon: 'users', count: assignments.length }] : []),
  ];

  return (
    <>
      <PageHead
        title={project.projectNo}
        subtitle={`${project.service.name} · ${project.client.name}`}
        back={{ onClick: () => navigate(-1), label: 'Projects' }}
        actions={
          <>
            {role === 'admin' && !archived ? (
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAssignOpen(true)}>
                <Icon name="users" size={15} /> Assign staff
              </button>
            ) : null}
            {canStage ? (
              <button type="button" className="btn btn--sm" onClick={() => { setActionError(''); setStageOpen(true); }}>
                <Icon name="activity" size={15} /> Update progress
              </button>
            ) : null}
          </>
        }
      />

      <div className="detail-head-meta mb-2">
        <Badge tone={stageTone(project.stage)}>{project.stageLabel}</Badge>
        {archived ? <Badge tone="slate">Archived</Badge> : null}
        <Badge tone="navy" dot={false}>{project.service.name}</Badge>
        {project.appointment?.referenceNo ? <Badge tone="slate" dot={false}>{project.appointment.referenceNo}</Badge> : null}
        {project.targetCompletionDate ? <Badge tone="amber" dot={false}><Icon name="calendar" size={12} /> Target {dateLabel(project.targetCompletionDate)}</Badge> : null}
      </div>

      <div className="card mb-2">
        <div className="flex justify-between items-center wrap gap-1">
          <div>
            <div className="tiny muted">Overall progress</div>
            <div className="strong">{project.progressPercent}% complete</div>
          </div>
          <div style={{ flex: '1 1 260px', maxWidth: 440 }}>
            <Progress value={project.progressPercent} showLabel />
          </div>
          <div className="tiny muted">Last updated {relativeTime(project.updatedAt)}</div>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Project sections" />

      {tab === 'overview' ? (
        <div className="split split--wide-left mt-2">
          <div className="stack">
            <Card>
              <div className="card__head">
                <div>
                  <h2>Engagement summary</h2>
                  <p className="sub">What the office is preparing for this property.</p>
                </div>
                {project.appointment?.referenceNo ? (
                  <Link className="btn btn--secondary btn--xs" to={appointmentPath(role, project.id === null ? 0 : undefined) || '#'} style={{ display: 'none' }}>—</Link>
                ) : null}
              </div>
              <div className="kv-grid">
                <div className="kv"><span>Service</span><b>{project.service.name}</b></div>
                <div className="kv"><span>Project number</span><b className="mono">{project.projectNo}</b></div>
                <div className="kv"><span>Started</span><b>{dateLabel(project.startedAt || project.createdAt)}</b></div>
                <div className="kv"><span>Target completion</span><b>{project.targetCompletionDate ? dateLabel(project.targetCompletionDate) : 'Not set'}</b></div>
                <div className="kv"><span>Lead surveyor</span><b>{project.leadSurveyor?.name || 'To be assigned'}</b></div>
                <div className="kv"><span>Base fee</span><b>{money(project.service.baseFee)}</b></div>
                {project.appointment?.referenceNo ? (
                  <div className="kv"><span>Appointment</span><b className="mono">{project.appointment.referenceNo}</b></div>
                ) : null}
                {project.appointment?.date ? (
                  <div className="kv"><span>Field visit</span><b>{dateLong(project.appointment.date)} · {timeLabel(project.appointment.time)}</b></div>
                ) : null}
              </div>
              {project.summary ? (
                <div className="mt-2">
                  <div className="subhead">Scope notes</div>
                  <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{project.summary}</p>
                </div>
              ) : null}
            </Card>

            <Card>
              <SectionTitle
                title="Property"
                sub={project.property?.addressLine || project.appointment?.location || 'No address recorded'}
                action={project.property?.addressLine || project.appointment?.location ? (
                  <a className="btn btn--secondary btn--xs" href={mapsUrl(project.property?.addressLine || project.appointment?.location)} target="_blank" rel="noreferrer noopener">
                    <Icon name="map" size={13} /> Map
                  </a>
                ) : null}
              />
              <div className="kv-grid">
                <div className="kv"><span>Lot no.</span><b>{project.property?.lotNo || '—'}</b></div>
                <div className="kv"><span>Barangay</span><b>{project.property?.barangay || '—'}</b></div>
                <div className="kv"><span>City / municipality</span><b>{project.property?.cityMunicipality || '—'}</b></div>
                <div className="kv"><span>Province</span><b>{project.property?.province || '—'}</b></div>
              </div>
            </Card>

            <Card>
              <SectionTitle title="Field schedule" sub="Planned visits and office work for this project." />
              {data.schedules?.length ? (
                <ul className="timeline">
                  {data.schedules.map((s) => (
                    <li key={s.id} className={s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'current' : ''}>
                      <div className="timeline__title">{s.title}</div>
                      <div className="timeline__meta">
                        {dateTimeLabel(s.startsAt)} – {String(s.endsAt || '').slice(11, 16)}
                        {s.staffName ? ` · ${s.staffName}` : ''}
                      </div>
                      <div className="timeline__note">
                        <StatusBadge status={s.status} />
                        {s.location ? ` · ${s.location}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>No field schedule entries yet.</p>
              )}
            </Card>
          </div>

          <div className="detail-side">
            <Card>
              <SectionTitle title="Pipeline" sub="Current position in the survey workflow." />
              <div className="stage-rail">
                {stages.map((stage, index) => (
                  <div
                    key={stage.key}
                    className={cn(
                      'stage-rail__item',
                      index < currentStageIndex && 'done',
                      stage.key === project.stage && 'current',
                    )}
                  >
                    <span className="stage-rail__dot">
                      {index < currentStageIndex ? <Icon name="check" size={12} /> : index + 1}
                    </span>
                    <span>
                      {stage.label}
                      {stage.key === project.stage ? <span className="tiny muted"> · now</span> : null}
                    </span>
                  </div>
                ))}
              </div>
              <Link to="#" className="link-btn small mt-2" onClick={(e) => { e.preventDefault(); setTab('progress'); }}>
                View full history <Icon name="arrowRight" size={13} />
              </Link>
            </Card>

            <Card>
              <SectionTitle title="Client" />
              <InfoRow label="Name">{project.client.name}</InfoRow>
              <InfoRow label="Email"><a href={`mailto:${project.client.email}`}>{project.client.email}</a></InfoRow>
              <InfoRow label="Phone">{project.client.phone || '—'}</InfoRow>
              {role === 'admin' ? (
                <Link to={`/admin/clients/${project.client.id}`} className="btn btn--secondary btn--sm btn--block mt-2">
                  Open client record
                </Link>
              ) : null}
            </Card>

            {role === 'admin' ? (
              <Card>
                <SectionTitle title="Records" />
                <div className="stack-xs">
                  {isComplete && !archived ? (
                    <button type="button" className="btn btn--secondary btn--block" disabled={busy === 'archive'} onClick={archive}>
                      <Icon name="archive" size={15} /> Archive project
                    </button>
                  ) : null}
                  {archived ? (
                    <button type="button" className="btn btn--secondary btn--block" disabled={busy === 'restore'} onClick={restore}>
                      <Icon name="refresh" size={15} /> Restore from archive
                    </button>
                  ) : null}
                  <div className="tiny muted">
                    Created {dateTimeLabel(project.createdAt)} · Updated {relativeTime(project.updatedAt)}
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'progress' ? (
        <div className="split split--wide-left mt-2">
          <Card>
            <SectionTitle title="Stage history" sub="Every stage change is recorded with who made it and why." />
            {history.length ? (
              <ul className="timeline">
                {history.map((h) => (
                  <li key={h.id} className={h.toStage === project.stage ? 'current' : 'done'}>
                    <div className="timeline__title">{h.toLabel}</div>
                    <div className="timeline__meta">
                      {dateTimeLabel(h.createdAt)} · {h.changedBy || 'System'}
                      {h.fromLabel ? ` · from ${h.fromLabel}` : ''}
                    </div>
                    {h.note ? <div className="timeline__note">{h.note}</div> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>No stage changes recorded yet.</p>
            )}
          </Card>
          <div className="detail-side">
            <Card>
              <SectionTitle title="Current stage" />
              <Badge tone={stageTone(project.stage)}>{project.stageLabel}</Badge>
              <div className="mt-2"><Progress value={project.progressPercent} showLabel /></div>
              {project.targetCompletionDate ? (
                <p className="small muted mt-2" style={{ margin: 0 }}>Target completion: {dateLong(project.targetCompletionDate)}</p>
              ) : null}
              {canStage ? (
                <button type="button" className="btn btn--block mt-2" onClick={() => { setActionError(''); setStageOpen(true); }}>
                  <Icon name="edit" size={15} /> Update progress
                </button>
              ) : null}
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'documents' ? (
        <Card className="mt-2">
          <SectionTitle
            title="Project documents"
            sub={`${documents.length} file(s) · ${documents.filter((d) => d.status === 'approved').length} approved`}
            action={
              <button type="button" className="btn btn--sm" onClick={() => setUploadOpen(true)}>
                <Icon name="upload" size={15} /> Upload
              </button>
            }
          />
          {documents.some((d) => d.status === 'rejected') ? (
            <Alert tone="danger" title="Some documents need correction">
              Rejected requirements are highlighted. Upload a corrected file to create a new version.
            </Alert>
          ) : null}
          {documents.length ? (
            <div className="stack-sm">
              {documents.map((doc) => (
                <div className="doc-review-row" key={doc.id}>
                  <span className="file-tile__icon" style={{ width: 38, height: 42, fontSize: '.6rem' }}>{doc.originalName.split('.').pop()?.slice(0, 4).toUpperCase()}</span>
                  <div className="doc-review-row__body">
                    <div className="flex items-center gap-1 wrap">
                      <strong className="small">{doc.title}</strong>
                      <Badge tone={docTone(doc.status)}>{titleCase(doc.status)}</Badge>
                      {doc.version > 1 ? <Badge tone="slate">v{doc.version}</Badge> : null}
                    </div>
                    <div className="tiny muted">
                      {doc.requirementName ? `${doc.requirementName} · ` : ''}{doc.originalName} · {doc.size} · uploaded by {doc.uploadedBy}
                    </div>
                    {doc.reviewNotes ? (
                      <div className="tiny" style={{ color: doc.status === 'rejected' ? 'var(--red-600)' : 'var(--gray-600)', marginTop: 2 }}>
                        Office note: {doc.reviewNotes}
                      </div>
                    ) : null}
                  </div>
                  <div className="table-actions">
                    <button type="button" className="btn btn--secondary btn--xs" onClick={() => setViewDoc(doc)}>
                      <Icon name="eye" size={13} /> View
                    </button>
                    {role === 'admin' && doc.status !== 'superseded' ? (
                      <button type="button" className="btn btn--ghost btn--xs" onClick={() => setReviewDoc(doc)}>
                        Review
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="file" title="No documents yet" message="Upload the documents the office needs for this survey." />
          )}
        </Card>
      ) : null}

      {tab === 'drawings' ? (
        <Card className="mt-2">
          <SectionTitle
            title="Survey plans & drawings"
            sub="Versioned files. Clients only see drawings approved for release."
            action={
              permissions.canUploadBlueprint ? (
                <button type="button" className="btn btn--sm" onClick={() => setBlueprintOpen(true)}>
                  <Icon name="upload" size={15} /> New drawing
                </button>
              ) : null
            }
          />
          {blueprints.length ? (
            <div className="stack-sm">
              {blueprints.map((b) => (
                <button key={b.id} type="button" className="attachment-link" onClick={() => setOpenBlueprint(b.id)} style={{ width: '100%', textAlign: 'left' }}>
                  <Icon name="layers" size={18} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block' }}>{b.title}</b>
                    <span className="tiny muted">v{b.currentVersion} · {b.versionCount} version(s) · updated {relativeTime(b.updatedAt)}</span>
                  </span>
                  <Badge tone={docTone(b.status)}>{titleCase(b.status)}</Badge>
                  <Icon name="chevronRight" size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon="layers"
              title="No drawings uploaded"
              message={permissions.canUploadBlueprint ? 'Upload the first survey plan for this project.' : 'The office will publish approved survey plans here.'}
              action={permissions.canUploadBlueprint ? <button type="button" className="btn" onClick={() => setBlueprintOpen(true)}><Icon name="upload" size={15} /> Upload drawing</button> : null}
            />
          )}
        </Card>
      ) : null}

      {tab === 'notes' && role !== 'client' ? (
        <Card className="mt-2">
          <SectionTitle
            title="Field notes"
            sub="Measurements, site issues and follow-ups shared with the office."
            action={<button type="button" className="btn btn--sm" onClick={() => { setActionError(''); setNoteOpen(true); }}><Icon name="plus" size={15} /> Add note</button>}
          />
          {fieldNotes.length ? (
            <div className="stack-sm">
              {fieldNotes.map((n) => (
                <div className="requirement-row" key={n.id} style={{ display: 'block' }}>
                  <div className="flex items-center gap-1 wrap">
                    <Badge tone={noteTone(n.type)}>{titleCase(n.type)}</Badge>
                    <strong className="small">{n.author}</strong>
                    <span className="tiny muted">{relativeTime(n.createdAt)}{n.recordedOn ? ` · recorded ${dateLabel(n.recordedOn)}` : ''}</span>
                  </div>
                  <p className="small" style={{ margin: '.35rem 0 0', whiteSpace: 'pre-wrap' }}>{n.body}</p>
                  {n.measurement ? <div className="tiny muted">Measurement / reference: {n.measurement}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="edit" title="No field notes" message="Record measurements and site observations while they are fresh." />
          )}
        </Card>
      ) : null}

      {tab === 'team' && role === 'admin' ? (
        <div className="split split--wide-left mt-2">
          <Card>
            <SectionTitle
              title="Project team"
              sub="Assigned staff can open this project and its working files."
              action={<button type="button" className="btn btn--sm" onClick={() => setAssignOpen(true)}><Icon name="plus" size={15} /> Assign</button>}
            />
            {assignments.length ? (
              <div className="stack-sm">
                {assignments.map((a) => (
                  <div className="flex items-center gap-1 wrap" key={a.id} style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: '.6rem' }}>
                    <span className="avatar avatar--navy">{a.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="strong small">{a.name}</div>
                      <div className="tiny muted">{a.role}{a.position ? ` · ${a.position}` : ''}{a.licenseNo ? ` · ${a.licenseNo}` : ''}</div>
                    </div>
                    <a className="btn btn--ghost btn--xs" href={`mailto:${a.email}`}><Icon name="mail" size={13} /></a>
                    <button type="button" className="btn btn--danger-soft btn--xs" onClick={() => unassign(a)} disabled={busy === 'unassign'}>
                      <Icon name="close" size={13} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon="users" title="No team assigned" message="Assign surveyors so they can work on this project." />
            )}
          </Card>
          <Card>
            <SectionTitle title="Lead surveyor" />
            <InfoRow label="Name">{project.leadSurveyor?.name || 'Not assigned'}</InfoRow>
            <InfoRow label="Appointment">{project.appointment?.referenceNo || '—'}</InfoRow>
            <InfoRow label="Location">{project.appointment?.location || '—'}</InfoRow>
          </Card>
        </div>
      ) : null}

      {stageOpen ? (
        <StageModal
          stages={stages}
          project={project}
          busy={busy === 'stage'}
          error={actionError}
          onClose={() => setStageOpen(false)}
          onSubmit={updateStage}
        />
      ) : null}

      {assignOpen ? (
        <AssignModal
          team={data.team || []}
          assigned={assignments}
          busy={busy === 'assign'}
          error={actionError}
          onClose={() => setAssignOpen(false)}
          onSubmit={assignStaff}
        />
      ) : null}

      {noteOpen ? (
        <NoteModal busy={busy === 'note'} error={actionError} onClose={() => setNoteOpen(false)} onSubmit={addNote} />
      ) : null}

      {uploadOpen ? (
        <UploadDocumentsModal
          projectId={project.id}
          onClose={() => setUploadOpen(false)}
          onDone={async () => { setUploadOpen(false); await reload(true); }}
        />
      ) : null}

      {blueprintOpen ? (
        <CreateBlueprintModal
          projectId={project.id}
          lockProject
          onClose={() => setBlueprintOpen(false)}
          onDone={async () => { setBlueprintOpen(false); await reload(true); }}
        />
      ) : null}

      {openBlueprint ? (
        <BlueprintModal
          id={openBlueprint}
          onClose={() => setOpenBlueprint(null)}
          onChanged={() => reload(true)}
        />
      ) : null}

      {viewDoc ? (
        <DocumentViewer doc={viewDoc} onClose={() => setViewDoc(null)} />
      ) : null}

      {reviewDoc ? (
        <ReviewModal
          doc={reviewDoc}
          onClose={() => setReviewDoc(null)}
          onDone={async () => { setReviewDoc(null); await reload(true); }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */
function StageModal({ stages, project, busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState({
    stage: project.stage === 'archived' ? 'completed' : project.stage,
    note: '',
    targetCompletionDate: project.targetCompletionDate || '',
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Update project progress"
      subtitle={`${project.projectNo} · client sees the new stage immediately`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="stage-form" className="btn" disabled={busy || form.stage === project.stage}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Save stage
          </button>
        </>
      }
    >
      <form id="stage-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ stage: form.stage, note: form.note || undefined, targetCompletionDate: form.targetCompletionDate || null }); }}>
        {error ? <Alert tone="danger" title="Could not update the stage">{error}</Alert> : null}
        <Field label="New stage" htmlFor="stage-select" required>
          <select id="stage-select" className="select" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
            {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Target completion date" htmlFor="stage-target" hint="Optional. Shown to the client and used for overdue reports.">
          <input id="stage-target" className="input" type="date" value={form.targetCompletionDate} onChange={(e) => setForm({ ...form, targetCompletionDate: e.target.value })} />
        </Field>
        <Field label="Note for the record" htmlFor="stage-note" hint="Stored in the stage history and visible to the client on their timeline.">
          <textarea id="stage-note" className="textarea" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What changed and what happens next?" />
        </Field>
      </form>
    </Modal>
  );
}

function AssignModal({ team, assigned, busy, error, onClose, onSubmit }) {
  const assignedIds = new Set(assigned.map((a) => a.staffId));
  const available = team.filter((t) => !assignedIds.has(t.id));
  const [form, setForm] = useState({ staffId: '', role: 'Field Surveyor' });

  return (
    <Modal
      open
      onClose={onClose}
      title="Assign staff to project"
      subtitle="Assigned surveyors can view working documents and update field progress."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="assign-form" className="btn" disabled={busy || !form.staffId}>
            {busy ? <span className="spinner" /> : <Icon name="userCheck" size={15} />} Assign
          </button>
        </>
      }
    >
      <form id="assign-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ staffId: Number(form.staffId), role: form.role }); }}>
        {error ? <Alert tone="danger" title="Could not assign the staff member">{error}</Alert> : null}
        <Field label="Staff member" htmlFor="assign-staff" required>
          <select id="assign-staff" className="select" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} required>
            <option value="">Select a surveyor…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}{t.position ? ` — ${t.position}` : ''} ({t.todayLoad} booking(s) today)
              </option>
            ))}
          </select>
        </Field>
        {!available.length ? <Alert tone="warn">Every active surveyor is already assigned to this project.</Alert> : null}
        <Field label="Role on project" htmlFor="assign-role" hint="For example: Lead Surveyor, Field Surveyor, Plan Reviewer.">
          <input id="assign-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} maxLength={80} />
        </Field>
      </form>
    </Modal>
  );
}

function NoteModal({ busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ type: 'note', body: '', measurement: '', recordedOn: todayISO() });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a field note"
      subtitle="Notes are timestamped and kept with the project record."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="field-note-form" className="btn" disabled={busy || form.body.trim().length < 3}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Save note
          </button>
        </>
      }
    >
      <form id="field-note-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, body: form.body.trim(), measurement: form.measurement || undefined, recordedOn: form.recordedOn || null }); }}>
        {error ? <Alert tone="danger" title="Could not save the note">{error}</Alert> : null}
        <div className="form-grid form-grid--2">
          <Field label="Note type" htmlFor="note-type">
            <select id="note-type" className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {NOTE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Date observed" htmlFor="note-date">
            <input id="note-date" className="input" type="date" value={form.recordedOn} onChange={(e) => setForm({ ...form, recordedOn: e.target.value })} />
          </Field>
        </div>
        <Field label="Note" htmlFor="note-body" required>
          <textarea id="note-body" className="textarea" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required placeholder="Describe what was found on site." />
        </Field>
        <Field label="Measurement or reference (optional)" htmlFor="note-measurement">
          <input id="note-measurement" className="input" value={form.measurement} onChange={(e) => setForm({ ...form, measurement: e.target.value })} placeholder="e.g. 245.60 sqm · corner monuments 1-4 verified" maxLength={160} />
        </Field>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Issues and follow-ups also alert the office automatically.</p>
      </form>
    </Modal>
  );
}

export function UploadDocumentsModal({ projectId, clientId, onClose, onDone, defaultRequirement }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState(defaultRequirement?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!files.length) {
      setError('Choose at least one file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      if (projectId) form.append('projectId', String(projectId));
      if (clientId) form.append('clientId', String(clientId));
      if (defaultRequirement?.id) form.append('requirementId', String(defaultRequirement.id));
      if (title.trim()) form.append('title', title.trim());
      files.forEach((file) => form.append('files', file));
      const result = await api.upload('/documents', form);
      toast.success(result.message || 'Documents uploaded.');
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
      title={defaultRequirement ? `Upload: ${defaultRequirement.name}` : 'Upload documents'}
      subtitle="Files are private. Only the office and assigned staff can open them."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="project-upload-form" className="btn" disabled={busy || !files.length}>
            {busy ? <span className="spinner" /> : <Icon name="upload" size={15} />} {busy ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      <form id="project-upload-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Upload failed">{error}</Alert> : null}
        <Field label="Document title (optional)" htmlFor="upload-title" hint="Leave blank to use the original file names.">
          <input id="upload-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} />
        </Field>
        <Dropzone
          files={files}
          onFiles={setFiles}
          multiple
          maxMb={15}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
          label="Choose files"
          hint="PDF, images, Word, Excel or text · up to 15 MB each · maximum 10 files"
        />
      </form>
    </Modal>
  );
}

export function DocumentViewer({ doc, onClose }) {
  const toast = useToast();
  return (
    <Modal open onClose={onClose} title={doc.originalName || doc.title} subtitle={`${doc.size || bytesLabel(doc.sizeBytes)} · ${titleCase(doc.status)}`} size="wide">
      <Viewer
        src={fileUrl(`/documents/${doc.id}/file`)}
        mimeType={doc.mimeType}
        name={doc.originalName || doc.title}
        height="62vh"
        onClose={onClose}
        onDownload={() => downloadApiFile(`/documents/${doc.id}/download`, doc.originalName).catch((err) => toast.error(err.message))}
      />
      {doc.reviewNotes ? (
        <Alert tone={doc.status === 'rejected' ? 'danger' : 'info'} title="Office review note">{doc.reviewNotes}</Alert>
      ) : null}
    </Modal>
  );
}

export function ReviewModal({ doc, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState(doc.status === 'submitted' ? 'under_review' : doc.status === 'approved' ? 'approved' : 'approved');
  const [notes, setNotes] = useState(doc.reviewNotes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (status === 'rejected' && !notes.trim()) {
      setError('Explain what needs to be corrected.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.patch(`/documents/${doc.id}/review`, { status, notes: notes.trim() || undefined });
      toast.success(result.message || 'Document reviewed.');
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
      title="Review document"
      subtitle={`${doc.title} · ${doc.originalName}`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="review-form" className="btn" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Save review
          </button>
        </>
      }
    >
      <form id="review-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not save the review">{error}</Alert> : null}
        <div className="segmented mb-2" role="group" aria-label="Review outcome">
          {[
            { key: 'under_review', label: 'Under review' },
            { key: 'approved', label: 'Approve' },
            { key: 'rejected', label: 'Needs correction' },
          ].map((option) => (
            <button key={option.key} type="button" className={status === option.key ? 'active' : ''} onClick={() => setStatus(option.key)}>
              {option.label}
            </button>
          ))}
        </div>
        <Field label={status === 'rejected' ? 'What needs correcting?' : 'Review note (optional)'} htmlFor="review-notes" hint="The client sees this note in their portal.">
          <textarea id="review-notes" className="textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={status === 'rejected' ? 'e.g. The title number does not match the lot. Please upload the correct page.' : 'Optional internal note for the client.'} />
        </Field>
      </form>
    </Modal>
  );
}
