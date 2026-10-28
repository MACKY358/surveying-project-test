// Role-aware document library: upload, preview, download and office review.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadApiFile } from '../api.js';
import { useAsync } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import {
  Alert,
  Badge,
  Card,
  Dropzone,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  Pagination,
  SearchInput,
  StatusBadge,
  useConfirm,
  useToast,
} from './ui.jsx';
import { DocumentViewer, ReviewModal } from './ProjectView.jsx';
import { docTone, projectPath } from './bits.jsx';
import { bytesLabel, cn, dateLabel, dateTimeLabel, fileExtension, isImage, isPdf, titleCase } from '../utils.js';

const STATUS_OPTIONS = [
  { key: 'all', label: 'All statuses' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Needs correction' },
  { key: 'superseded', label: 'Replaced' },
];

export default function DocumentsView() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('all');
  const [projectId, setProjectId] = useState('');
  const [viewerDoc, setViewerDoc] = useState(null);
  const [reviewDoc, setReviewDoc] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [q]);

  const projectsState = useAsync(() => api.get('/projects', { pageSize: 100 }), []);
  const { data, loading, error, reload } = useAsync(
    () =>
      api.get('/documents', {
        page,
        pageSize: 12,
        q: debouncedQ,
        status,
        projectId: projectId || undefined,
        sort: 'created',
        dir: 'desc',
      }),
    [page, debouncedQ, status, projectId],
  );

  const documents = data?.documents || [];
  const projects = projectsState.data?.projects || [];

  async function remove(doc) {
    const ok = await confirm({
      title: 'Remove document',
      message: `"${doc.title}" will be removed from your records. This cannot be undone.`,
      confirmLabel: 'Remove document',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.del(`/documents/${doc.id}`);
      toast.success(result.message || 'Document removed.');
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const canReview = user?.role === 'admin';
  const canDelete = user?.role === 'client' || user?.role === 'admin';

  return (
    <>
      <PageHead
        title={user?.role === 'client' ? 'My documents' : 'Document review'}
        subtitle={
          user?.role === 'client'
            ? 'Upload title documents, tax declarations and plan requirements for your survey.'
            : 'Review client submissions, request corrections and keep the project record complete.'
        }
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => reload(true)}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
            <button type="button" className="btn" onClick={() => setUploadOpen(true)}>
              <Icon name="upload" size={16} /> Upload document
            </button>
          </>
        }
      />

      <Card className="mb-2">
        <div className="filters">
          <div style={{ flex: 2 }}>
            <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search by title, file name or client…" />
          </div>
          <Field label="Status" htmlFor="doc-status">
            <select id="doc-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Project" htmlFor="doc-project">
            <select id="doc-project" className="select" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.projectNo} — {p.service.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {loading && !data ? <Loading label="Loading documents…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !documents.length ? (
        <Card>
          <Empty
            icon="file"
            title={debouncedQ || status !== 'all' || projectId ? 'No documents match those filters' : 'No documents yet'}
            message={
              debouncedQ || status !== 'all' || projectId
                ? 'Try clearing the search or choosing a different status.'
                : 'Upload your first requirement to start the document record for your project.'
            }
            action={
              !debouncedQ && status === 'all' && !projectId ? (
                <button type="button" className="btn" onClick={() => setUploadOpen(true)}>
                  <Icon name="upload" size={16} /> Upload a document
                </button>
              ) : null
            }
          />
        </Card>
      ) : null}

      {documents.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Document</th>
                  {user?.role !== 'client' ? <th>Client</th> : null}
                  <th>Project</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td data-label="Document">
                      <button
                        type="button"
                        className="link-btn"
                        style={{ textAlign: 'left', fontWeight: 650 }}
                        onClick={() => setViewerDoc(doc)}
                      >
                        {doc.title}
                      </button>
                      <span className="cell-sub">
                        {fileExtension(doc.originalName)} · {doc.size} · v{doc.version}
                      </span>
                      {doc.reviewNotes ? <span className="cell-sub" style={{ color: doc.status === 'rejected' ? 'var(--red-600)' : undefined }}>{doc.reviewNotes}</span> : null}
                    </td>
                    {user?.role !== 'client' ? (
                      <td data-label="Client">
                        <span className="cell-main">{doc.client.name}</span>
                      </td>
                    ) : null}
                    <td data-label="Project">
                      {doc.project ? (
                        <Link className="link-btn small" to={projectPath(user?.role, doc.project.id)}>{doc.project.projectNo}</Link>
                      ) : (
                        <span className="muted">General</span>
                      )}
                      {doc.requirementName ? <span className="cell-sub">{doc.requirementName}</span> : null}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={doc.status} />
                      {doc.reviewedBy ? <span className="cell-sub">by {doc.reviewedBy}</span> : null}
                    </td>
                    <td data-label="Uploaded">
                      <span className="small">{dateLabel(doc.createdAt)}</span>
                      <span className="cell-sub">{dateTimeLabel(doc.createdAt).split('·')[1] || ''}</span>
                    </td>
                    <td data-label="" className="cell-actions">
                      <div className="table-actions">
                        <button type="button" className="btn btn--secondary btn--xs" onClick={() => setViewerDoc(doc)}>
                          <Icon name="eye" size={14} /> View
                        </button>
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs"
                          onClick={() => downloadApiFile(`/documents/${doc.id}/download`, doc.originalName).catch((err) => toast.error(err.message))}
                        >
                          <Icon name="download" size={14} /> Download
                        </button>
                        {canReview ? (
                          <button type="button" className="btn btn--secondary btn--xs" onClick={() => setReviewDoc(doc)}>
                            <Icon name="clipboard" size={14} /> Review
                          </button>
                        ) : null}
                        {canDelete && !['approved', 'under_review'].includes(doc.status) ? (
                          <button type="button" className="icon-btn" aria-label={`Remove ${doc.title}`} onClick={() => remove(doc)}>
                            <Icon name="trash" size={16} />
                          </button>
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

      {!documents.length && data ? null : null}

      {viewerDoc ? <DocumentViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} /> : null}
      {reviewDoc ? (
        <ReviewModal
          doc={reviewDoc}
          onClose={() => setReviewDoc(null)}
          onDone={async () => { setReviewDoc(null); await reload(true); }}
        />
      ) : null}
      {uploadOpen ? (
        <UploadDocumentModal
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => setUploadOpen(false)}
          onDone={async () => { setUploadOpen(false); await reload(true); }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */
function UploadDocumentModal({ projects, defaultProjectId, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ projectId: defaultProjectId || '', requirementId: '', title: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  const requirementsState = useAsync(
    () => (form.projectId ? api.get('/documents/requirements', { projectId: form.projectId }) : Promise.resolve({ requirements: [] })),
    [form.projectId],
  );
  const requirements = (requirementsState.data?.requirements || []).filter((r) => r.status !== 'approved' || true);
  const selectedRequirement = requirements.find((r) => String(r.id) === String(form.requirementId));

  async function submit(event) {
    event.preventDefault();
    if (!files.length) {
      setError('Choose at least one file to upload.');
      return;
    }
    if (!form.projectId) {
      setError('Choose the project this document belongs to.');
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      const data = new FormData();
      data.append('projectId', form.projectId);
      if (form.requirementId) data.append('requirementId', form.requirementId);
      if (form.title.trim()) data.append('title', form.title.trim());
      files.forEach((file) => data.append('files', file));
      const result = await api.upload('/documents', data);
      toast.success(result.message || 'Documents uploaded.');
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
      title="Upload documents"
      subtitle="Files are stored privately and can only be opened by you, assigned field staff and the office."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="doc-upload-form" className="btn" disabled={busy || !files.length}>
            {busy ? <span className="spinner" /> : <Icon name="upload" size={15} />} Upload {files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''}
          </button>
        </>
      }
    >
      <form id="doc-upload-form" onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not upload the documents">{error}</Alert> : null}
        <Field label="Project" htmlFor="doc-upload-project" required error={fields.projectId}>
          <select
            id="doc-upload-project"
            className="select"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value, requirementId: '' })}
            required
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectNo} — {p.service.name} · {p.client?.name || ''}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Requirement (optional)"
          htmlFor="doc-upload-requirement"
          hint={selectedRequirement?.description || 'Choose the checklist item this file satisfies, if any.'}
        >
          <select
            id="doc-upload-requirement"
            className="select"
            value={form.requirementId}
            onChange={(e) => {
              const next = e.target.value;
              const req = requirements.find((r) => String(r.id) === String(next));
              setForm({ ...form, requirementId: next, title: req && !form.title ? req.name : form.title });
            }}
            disabled={!form.projectId || requirementsState.loading}
          >
            <option value="">Not linked to a requirement</option>
            {requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {titleCase(r.status)}{r.isRequired ? ' (required)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {requirementsState.loading ? <p className="tiny muted">Loading requirements…</p> : null}
        {selectedRequirement ? (
          <Alert tone={selectedRequirement.status === 'rejected' ? 'warn' : 'info'}>
            This upload becomes version {(selectedRequirement.latestDocument?.version || 0) + 1}. The previous version is kept in the
            record and marked as replaced.
            {selectedRequirement.allowedTypes ? ` Accepted: ${selectedRequirement.allowedTypes.join(', ')} · up to ${selectedRequirement.maxSizeMb} MB.` : ''}
          </Alert>
        ) : null}
        <Field label="Document title" htmlFor="doc-upload-title" error={fields.title} hint="Defaults to the requirement name or file name.">
          <input id="doc-upload-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={180} />
        </Field>
        <Field label="Files" required error={fields.files} hint="Up to 10 files. PDF, Word, Excel, text or images.">
          <Dropzone
            files={files}
            onFiles={setFiles}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
            maxMb={20}
            label="Choose files or drop them here"
          />
        </Field>
      </form>
    </Modal>
  );
}
