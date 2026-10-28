// Shared project register used by the client, admin and field-staff portals.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
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
  Progress,
  SearchInput,
  StatusBadge,
} from './ui.jsx';
import { dateLabel, dateTimeLabel, stageTone } from '../utils.js';
import { projectPath } from './bits.jsx';

export default function ProjectList() {
  const { user } = useAuth();
  const role = user?.role || 'client';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [stage, setStage] = useState('all');
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const { data, loading, error, reload } = useAsync(
    () =>
      api.get('/projects', {
        page,
        pageSize: 12,
        q: debouncedQ,
        stage,
        archived: archived ? 1 : undefined,
        sort: 'updated',
        dir: 'desc',
      }),
    [page, debouncedQ, stage, archived],
  );

  const projects = data?.projects || [];
  const stages = data?.stages || [];

  return (
    <>
      <PageHead
        title={role === 'client' ? 'My projects' : archived ? 'Archived projects' : role === 'surveyor' ? 'Assigned projects' : 'Survey projects'}
        subtitle={
          role === 'client'
            ? 'Follow every stage of your survey, from field work to the released plan.'
            : archived
              ? 'Completed projects that have been archived. Files and history are retained.'
              : 'Track fieldwork, document requirements and plan releases across the office.'
        }
        actions={
          role === 'admin' ? (
            <button type="button" className="btn btn--secondary" onClick={() => { setArchived((v) => !v); setPage(1); }}>
              <Icon name="archive" size={16} /> {archived ? 'Back to active projects' : 'View archives'}
            </button>
          ) : null
        }
      />

      <Card className="mb-2">
        <div className="filters">
          <div style={{ flex: 2 }}>
            <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search project number, lot or client…" />
          </div>
          <Field label="Stage" htmlFor="project-stage">
            <select id="project-stage" className="select" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
              <option value="all">All stages</option>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Order" htmlFor="project-order">
            <select id="project-order" className="select" value="updated" disabled>
              <option value="updated">Recently updated</option>
            </select>
          </Field>
        </div>
      </Card>

      {loading && !data ? <Loading label="Loading projects…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !projects.length ? (
        <Card>
          <Empty
            icon="folder"
            title={debouncedQ || stage !== 'all' ? 'No projects match those filters' : archived ? 'No archived projects' : 'No projects yet'}
            message={
              debouncedQ || stage !== 'all'
                ? 'Try clearing the search or selecting a different stage.'
                : role === 'client'
                  ? 'A project opens automatically once the office approves your first appointment request.'
                  : archived
                    ? 'Completed projects you archive will be listed here for record keeping.'
                    : 'Projects are created automatically when an appointment request is approved.'
            }
            action={
              role === 'client' && !debouncedQ && stage === 'all' && !archived ? (
                <Link className="btn" to="/app/book">
                  <Icon name="calendarPlus" size={16} /> Book a survey
                </Link>
              ) : null
            }
          />
        </Card>
      ) : null}

      {projects.length ? (
        <div className="stack">
          {projects.map((project) => (
            <Card key={project.id} className="project-row" style={{ padding: '1rem' }}>
              <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <div className="flex items-start justify-between gap-1 wrap">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-1 wrap">
                      <Link className="link-btn" style={{ fontSize: '.95rem', fontWeight: 750 }} to={projectPath(role, project.id)}>
                        {project.projectNo}
                      </Link>
                      <StatusBadge status={project.stage} label={project.stageLabel} />
                      {project.archivedAt ? <span className="badge badge--slate">Archived</span> : null}
                      {project.counts.rejectedDocuments > 0 ? (
                        <span className="badge badge--red">{project.counts.rejectedDocuments} doc{project.counts.rejectedDocuments === 1 ? '' : 's'} to fix</span>
                      ) : null}
                    </div>
                    <div className="small muted" style={{ marginTop: 2 }}>
                      {project.service.name}
                      {project.property?.lotNo ? ` · Lot ${project.property.lotNo}` : ''}
                      {project.property?.barangay ? ` · Brgy. ${project.property.barangay}` : ''}
                      {project.property?.cityMunicipality ? `, ${project.property.cityMunicipality}` : ''}
                    </div>
                    {role !== 'client' ? (
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        Client: {project.client.name}
                        {project.leadSurveyor ? ` · Lead: ${project.leadSurveyor.name}` : ''}
                      </div>
                    ) : null}
                  </div>
                  <Link className="btn btn--secondary btn--sm" to={projectPath(role, project.id)}>
                    Open <Icon name="arrowRight" size={14} />
                  </Link>
                </div>

                <div className="mt-2" style={{ display: 'grid', gap: '.35rem' }}>
                  <Progress value={project.progressPercent} showLabel />
                  <div className="flex wrap items-center gap-1 tiny muted">
                    <span>Started {dateLabel(project.startedAt || project.createdAt)}</span>
                    <span className="dot-sep">·</span>
                    <span>Updated {dateTimeLabel(project.updatedAt)}</span>
                    {project.targetCompletionDate ? (
                      <>
                        <span className="dot-sep">·</span>
                        <span>Target {dateLabel(project.targetCompletionDate)}</span>
                      </>
                    ) : null}
                    <span className="dot-sep">·</span>
                    <span>{project.counts.documents} document{project.counts.documents === 1 ? '' : 's'}</span>
                    <span className="dot-sep">·</span>
                    <span>{project.counts.blueprints} drawing{project.counts.blueprints === 1 ? '' : 's'}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          <Pagination meta={data?.meta} onPage={setPage} />
        </div>
      ) : null}
    </>
  );
}
