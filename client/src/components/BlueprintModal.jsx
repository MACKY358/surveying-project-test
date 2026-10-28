// Blueprint detail with version history, secure preview and release workflow.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadApiFile, fileUrl } from '../api.js';
import { useAsync } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import Viewer from './Viewer.jsx';
import {
  Modal,
  Alert,
  Badge,
  Empty,
  ErrorState,
  Field,
  Loading,
  StatusBadge,
  Dropzone,
  useToast,
  useConfirm,
} from './ui.jsx';
import {
  bytesLabel,
  cn,
  dateLabel,
  dateTimeLabel,
  isPdf,
  titleCase,
  todayISO,
} from '../utils.js';
import { projectPath } from './bits.jsx';

function previewable(mime, name) {
  return /^image\//i.test(String(mime || '')) || isPdf(mime, name);
}

export default function BlueprintModal({ id, onClose, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync(() => api.get(`/blueprints/${id}`), [id]);
  const [activeVersion, setActiveVersion] = useState(null);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const blueprint = data?.blueprint;
  const versions = data?.versions || [];
  const permissions = data?.permissions || {};

  useEffect(() => {
    if (versions.length && !versions.find((v) => v.id === activeVersion)) {
      setActiveVersion(versions[0].id);
    }
  }, [versions, activeVersion]);

  const version = versions.find((v) => v.id === activeVersion) || versions[0] || null;

  async function setStatus(status) {
    const labels = {
      approved_for_release: 'Release this drawing to the client?',
      draft: 'Return this drawing to draft? It will be hidden from the client.',
      archived: 'Archive this drawing? Files are retained for records.',
    };
    const ok = await confirm({
      title: 'Update drawing status',
      message: labels[status] || `Mark this drawing as ${titleCase(status)}?`,
      confirmLabel: status === 'archived' ? 'Archive' : 'Confirm',
      danger: status === 'archived',
    });
    if (!ok) return;
    setBusy(status);
    setActionError('');
    try {
      const result = await api.patch(`/blueprints/${id}/status`, { status });
      toast.success(result.message || 'Drawing status updated.');
      await reload(true);
      if (onChanged) onChanged();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function archive() {
    const ok = await confirm({
      title: 'Archive drawing',
      message: 'The drawing and every revision will be archived. Files are kept for the retention period.',
      confirmLabel: 'Archive drawing',
      danger: true,
    });
    if (!ok) return;
    setBusy('archive');
    try {
      const result = await api.del(`/blueprints/${id}`);
      toast.success(result.message || 'Drawing archived.');
      onClose();
      if (onChanged) onChanged();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={blueprint?.title || 'Survey plan'}
        subtitle={
          blueprint
            ? `${blueprint.project.projectNo}${blueprint.lotNo ? ` · Lot ${blueprint.lotNo}` : ''} · ${blueprint.client.name}`
            : 'Loading drawing record…'
        }
        size="wide"
        footer={
          <>
            {version && previewable(version.mimeType, version.fileName) && version ? (
              <a
                className="btn btn--secondary"
                href={fileUrl(`/blueprints/versions/${version.id}/file`)}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="external" size={15} /> Open in new tab
              </a>
            ) : null}
            {permissions.canUploadVersion ? (
              <button type="button" className="btn btn--secondary" onClick={() => setUploadOpen(true)}>
                <Icon name="upload" size={15} /> Upload revision
              </button>
            ) : null}
            {permissions.canApprove && blueprint && blueprint.status !== 'approved_for_release' && blueprint.status !== 'archived' ? (
              <button type="button" className="btn" onClick={() => setStatus('approved_for_release')} disabled={!!busy}>
                {busy === 'approved_for_release' ? <span className="spinner" /> : <Icon name="check" size={15} />} Approve for release
              </button>
            ) : null}
            <button type="button" className="btn btn--secondary" onClick={onClose}>Close</button>
          </>
        }
      >
        {loading ? <Loading label="Opening the survey plan…" /> : null}
        {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

        {data ? (
          <>
            {actionError ? <Alert tone="danger" title="Could not update the drawing">{actionError}</Alert> : null}

            <div className="detail-head-meta mb-2">
              <StatusBadge status={blueprint.status} label={blueprint.statusLabel} />
              <Badge tone="slate">Version {blueprint.currentVersion}</Badge>
              <span className="muted small">Updated {dateTimeLabel(blueprint.updatedAt)}</span>
              {permissions.canApprove ? (
                <Link className="link-btn small" to={projectPath('admin', blueprint.project.id)} onClick={onClose}>
                  Open project
                </Link>
              ) : null}
            </div>

            {blueprint.description ? <p className="small muted">{blueprint.description}</p> : null}

            {permissions.canApprove && blueprint.status !== 'archived' ? (
              <div className="btn-row mb-2">
                {blueprint.status === 'approved_for_release' ? (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setStatus('draft')} disabled={!!busy}>
                    <Icon name="refresh" size={14} /> Return to draft
                  </button>
                ) : null}
                {blueprint.status === 'for_review' ? (
                  <span className="badge badge--amber">Awaiting release approval</span>
                ) : null}
                <button type="button" className="btn btn--danger-soft btn--sm" onClick={archive} disabled={!!busy}>
                  {busy === 'archive' ? <span className="spinner" /> : <Icon name="archive" size={14} />} Archive drawing
                </button>
              </div>
            ) : null}

            {permissions.canApprove && blueprint.status === 'for_review' ? (
              <Alert tone="warn" title="Internal only">
                This revision is visible to staff but not to the client until you approve it for release.
              </Alert>
            ) : null}

            {versions.length ? (
              <div className="stack">
                <div className="tabs" role="tablist" aria-label="Drawing versions">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      role="tab"
                      aria-selected={version?.id === v.id}
                      className={cn('tab', version?.id === v.id && 'active')}
                      onClick={() => setActiveVersion(v.id)}
                    >
                      v{v.version}
                      {v.status === 'approved_for_release' ? <span className="count">released</span> : null}
                    </button>
                  ))}
                </div>

                {version ? (
                  <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                    <div className="card" style={{ padding: '.8rem' }}>
                      <div className="flex wrap items-center gap-1 mb-1">
                        <Icon name="file" size={16} />
                        <b className="small wrap-anywhere">{version.fileName}</b>
                        <Badge tone="slate">{version.size}</Badge>
                        <StatusBadge status={version.status} label={version.statusLabel} />
                      </div>
                      <div className="muted tiny mb-1">
                        Uploaded by {version.uploadedBy} on {dateTimeLabel(version.createdAt)}
                        {version.approvedBy ? ` · Released by ${version.approvedBy} on ${dateTimeLabel(version.approvedAt)}` : ''}
                      </div>
                      {version.revisionNotes ? <p className="small" style={{ margin: '0 0 .4rem' }}>{version.revisionNotes}</p> : null}
                      {version.internalNotes ? (
                        <Alert tone="info" title="Office note">{version.internalNotes}</Alert>
                      ) : null}
                      <div className="btn-row mt-1">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() =>
                            downloadApiFile(
                              `/blueprints/versions/${version.id}/download`,
                              version.fileName,
                            ).catch((err) => toast.error(err.message))
                          }
                        >
                          <Icon name="download" size={14} /> Download file
                        </button>
                      </div>
                    </div>

                    {previewable(version.mimeType, version.fileName) ? (
                      <Viewer
                        src={fileUrl(`/blueprints/versions/${version.id}/file`)}
                        mimeType={version.mimeType}
                        name={version.fileName}
                        height="52vh"
                        onDownload={() =>
                          downloadApiFile(`/blueprints/versions/${version.id}/download`, version.fileName).catch((err) =>
                            toast.error(err.message),
                          )
                        }
                      />
                    ) : (
                      <Alert tone="warn" title="Preview not available">
                        {version.fileName} is a {titleCase((version.fileName.split('.').pop() || 'file'))} file. Download it to open
                        in a desktop application.
                      </Alert>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <Empty icon="layers" title="No drawing file yet" message="Upload the first revision to start the version history." />
            )}
          </>
        ) : null}
      </Modal>

      {uploadOpen && blueprint ? (
        <UploadRevisionModal
          blueprint={blueprint}
          onClose={() => setUploadOpen(false)}
          onDone={async () => {
            setUploadOpen(false);
            await reload(true);
            if (onChanged) onChanged();
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* New revision                                                        */
/* ------------------------------------------------------------------ */
function UploadRevisionModal({ blueprint, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ revisionNotes: '', status: 'for_review' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  async function submit(event) {
    event.preventDefault();
    if (!file) {
      setError('Attach the revised drawing file.');
      return;
    }
    if (form.revisionNotes.trim().length < 3) {
      setError('Describe what changed in this revision.');
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('revisionNotes', form.revisionNotes.trim());
      data.append('status', form.status);
      const result = await api.upload(`/blueprints/${blueprint.id}/versions`, data);
      toast.success(result.message || 'New revision uploaded.');
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
      title={`Upload revision v${Number(blueprint.currentVersion) + 1}`}
      subtitle={`${blueprint.project.projectNo} · ${blueprint.title}`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="revision-form" className="btn" disabled={busy || !file}>
            {busy ? <span className="spinner" /> : <Icon name="upload" size={15} />} Upload revision
          </button>
        </>
      }
    >
      <form id="revision-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not upload the revision">{error}</Alert> : null}
        <Field label="Revised drawing" required error={fields.file} hint="PDF, JPG, PNG, WebP or TIFF. The previous revision stays available.">
          <Dropzone
            files={file ? [file] : []}
            onFiles={(files) => setFile(files[0] || null)}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff"
            multiple={false}
            label="Choose the revised drawing"
          />
        </Field>
        <Field label="Revision notes" htmlFor="revision-notes" required error={fields.revisionNotes} hint="Shown in the version history.">
          <textarea
            id="revision-notes"
            className="textarea"
            rows={3}
            value={form.revisionNotes}
            onChange={(e) => setForm({ ...form, revisionNotes: e.target.value })}
            placeholder="e.g. Corrected the lot line along the northeast boundary."
            required
          />
        </Field>
        <Field label="Visibility" htmlFor="revision-status" hint="Send to the office for release approval, or keep it as an internal draft.">
          <select id="revision-status" className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="for_review">Submit for review</option>
            <option value="draft">Keep as draft</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Create drawing                                                      */
/* ------------------------------------------------------------------ */
export function CreateBlueprintModal({ projectId, lockProject = false, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    projectId: projectId || '',
    title: '',
    lotNo: '',
    description: '',
    revisionNotes: 'Initial upload',
    status: 'for_review',
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  const projectsState = useAsync(
    () => (lockProject ? Promise.resolve({ projects: [] }) : api.get('/projects', { pageSize: 100, sort: 'updated', dir: 'desc' })),
    [lockProject],
  );

  async function submit(event) {
    event.preventDefault();
    if (!file) {
      setError('Attach the drawing file (PDF or image).');
      return;
    }
    if (!form.projectId) {
      setError('Choose the project this drawing belongs to.');
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('projectId', String(form.projectId));
      data.append('title', form.title.trim());
      if (form.lotNo.trim()) data.append('lotNo', form.lotNo.trim());
      if (form.description.trim()) data.append('description', form.description.trim());
      if (form.revisionNotes.trim()) data.append('revisionNotes', form.revisionNotes.trim());
      data.append('status', form.status);
      const result = await api.upload('/blueprints', data);
      toast.success(result.message || 'Drawing uploaded.');
      onDone(result.id);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const projects = projectsState.data?.projects || [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload a survey plan"
      subtitle="Drawings stay internal until an administrator approves them for release."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="blueprint-create-form" className="btn" disabled={busy || !file}>
            {busy ? <span className="spinner" /> : <Icon name="upload" size={15} />} Upload drawing
          </button>
        </>
      }
    >
      <form id="blueprint-create-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not upload the drawing">{error}</Alert> : null}
        {!lockProject ? (
          <Field label="Project" htmlFor="blueprint-project" required error={fields.projectId}>
            {projectsState.loading ? (
              <div className="small muted">Loading projects…</div>
            ) : (
              <select
                id="blueprint-project"
                className="select"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                required
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectNo} — {p.service.name} · {p.client.name}
                  </option>
                ))}
              </select>
            )}
            {projectsState.error ? <div className="field__error">{projectsState.error.message}</div> : null}
          </Field>
        ) : null}
        <Field label="Drawing title" htmlFor="blueprint-title" required error={fields.title}>
          <input
            id="blueprint-title"
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Subdivision Plan — Lot 12, Block 4"
            maxLength={180}
            required
          />
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="Lot number" htmlFor="blueprint-lot" error={fields.lotNo}>
            <input id="blueprint-lot" className="input" value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} placeholder="Lot 12" maxLength={60} />
          </Field>
          <Field label="Initial status" htmlFor="blueprint-status" hint="Review sends it to the administrator queue.">
            <select id="blueprint-status" className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="for_review">Submit for review</option>
              <option value="draft">Keep as draft</option>
            </select>
          </Field>
        </div>
        <Field label="Description" htmlFor="blueprint-description" error={fields.description}>
          <textarea
            id="blueprint-description"
            className="textarea"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional notes about the drawing."
          />
        </Field>
        <Field label="Drawing file" required error={fields.file} hint="PDF, JPG, PNG, WebP or TIFF.">
          <Dropzone
            files={file ? [file] : []}
            onFiles={(files) => setFile(files[0] || null)}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff"
            multiple={false}
            label="Choose the drawing file"
          />
        </Field>
        <Field label="Revision notes" htmlFor="blueprint-revision" error={fields.revisionNotes}>
          <input
            id="blueprint-revision"
            className="input"
            value={form.revisionNotes}
            onChange={(e) => setForm({ ...form, revisionNotes: e.target.value })}
            maxLength={500}
          />
        </Field>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          The file is stored privately. Clients can only open a revision after it is approved for release.
        </p>
      </form>
    </Modal>
  );
}
