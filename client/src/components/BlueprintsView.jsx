// Survey plan / blueprint library with release status.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadApiFile } from '../api.js';
import { useAsync } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import {
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
  Pagination,
  SearchInput,
  StatusBadge,
  useToast,
} from './ui.jsx';
import BlueprintModal, { CreateBlueprintModal } from './BlueprintModal.jsx';
import { projectPath } from './bits.jsx';
import { dateLabel, fileExtension } from '../utils.js';

export default function BlueprintsView() {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.role || 'client';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('all');
  const [projectId, setProjectId] = useState('');
  const [openId, setOpenId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [q]);

  const projectsState = useAsync(() => api.get('/projects', { pageSize: 100 }), []);
  const { data, loading, error, reload } = useAsync(
    () =>
      api.get('/blueprints', {
        page,
        pageSize: 12,
        q: debouncedQ,
        status,
        projectId: projectId || undefined,
        sort: 'updated',
        dir: 'desc',
      }),
    [page, debouncedQ, status, projectId],
  );

  const blueprints = data?.blueprints || [];
  const statuses = data?.statuses || [];
  const projects = projectsState.data?.projects || [];

  return (
    <>
      <PageHead
        title={role === 'client' ? 'Survey plans' : 'Survey plans & drawings'}
        subtitle={
          role === 'client'
            ? 'Approved plans released by the office. Every revision is kept in the record.'
            : 'Manage plan revisions and release approved drawings to clients.'
        }
        actions={
          role === 'admin' ? (
            <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
              <Icon name="upload" size={16} /> Upload drawing
            </button>
          ) : null
        }
      />

      {role === 'client' ? (
        <Card className="panel--tint mb-2" style={{ padding: '.85rem 1rem' }}>
          <div className="flex items-start gap-1">
            <Icon name="shield" size={18} />
            <p className="small" style={{ margin: 0 }}>
              Only drawings approved for release by the Geodetic Engineer appear here. Working drafts remain private until they are
              checked and signed off.
            </p>
          </div>
        </Card>
      ) : null}

      <Card className="mb-2">
        <div className="filters">
          <div style={{ flex: 2 }}>
            <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search drawing title, lot or project…" />
          </div>
          <Field label="Status" htmlFor="bp-status">
            <select id="bp-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Project" htmlFor="bp-project">
            <select id="bp-project" className="select" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.projectNo} — {p.service.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {loading && !data ? <Loading label="Loading survey plans…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !blueprints.length ? (
        <Card>
          <Empty
            icon="layers"
            title={debouncedQ || status !== 'all' || projectId ? 'No plans match those filters' : 'No survey plans yet'}
            message={
              role === 'client'
                ? 'Your approved survey plan will appear here once the office releases it. You will receive a notification.'
                : 'Upload a drawing against a project to start the revision history.'
            }
            action={
              role === 'admin' && !debouncedQ ? (
                <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
                  <Icon name="upload" size={16} /> Upload a drawing
                </button>
              ) : null
            }
          />
        </Card>
      ) : null}

      {blueprints.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Drawing</th>
                  {role !== 'client' ? <th>Client</th> : null}
                  <th>Project</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {blueprints.map((bp) => (
                  <tr key={bp.id}>
                    <td data-label="Drawing">
                      <button type="button" className="link-btn" style={{ textAlign: 'left', fontWeight: 650 }} onClick={() => setOpenId(bp.id)}>
                        {bp.title}
                      </button>
                      <span className="cell-sub">
                        {bp.lotNo ? `Lot ${bp.lotNo} · ` : ''}
                        {fileExtension(bp.latestFile || '')} {bp.latestFile ? `· ${bp.latestFile}` : ''}
                      </span>
                    </td>
                    {role !== 'client' ? (
                      <td data-label="Client"><span className="small">{bp.client.name}</span></td>
                    ) : null}
                    <td data-label="Project">
                      <Link className="link-btn small" to={projectPath(role, bp.project.id)}>{bp.project.projectNo}</Link>
                    </td>
                    <td data-label="Status"><StatusBadge status={bp.status} label={bp.statusLabel} /></td>
                    <td data-label="Version">
                      <span className="small">v{bp.currentVersion}</span>
                      <span className="cell-sub">{bp.versionCount} file{bp.versionCount === 1 ? '' : 's'}</span>
                    </td>
                    <td data-label="Updated"><span className="small">{dateLabel(bp.updatedAt)}</span></td>
                    <td data-label="" className="cell-actions">
                      <div className="table-actions">
                        <button type="button" className="btn btn--secondary btn--xs" onClick={() => setOpenId(bp.id)}>
                          <Icon name="eye" size={14} /> Open
                        </button>
                        {bp.latestVersionId ? (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Download latest file"
                            onClick={() =>
                              downloadApiFile(`/blueprints/versions/${bp.latestVersionId}/download`, bp.latestFile).catch((err) =>
                                toast.error(err.message),
                              )
                            }
                          >
                            <Icon name="download" size={16} />
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

      {openId ? (
        <BlueprintModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => reload(true)}
        />
      ) : null}

      {createOpen ? (
        <CreateBlueprintModal
          onClose={() => setCreateOpen(false)}
          onDone={async (id) => {
            setCreateOpen(false);
            await reload(true);
            if (id) setOpenId(id);
          }}
        />
      ) : null}
    </>
  );
}
