import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Alert,
  Avatar,
  Badge,
  Card,
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
} from '../../components/ui.jsx';
import { dateLabel, dateTimeLabel, money, stageTone, timeLabel } from '../../utils.js';

const ID_TYPES = [
  "Driver's license",
  'Passport',
  'PhilSys / National ID',
  'UMID',
  'Voter ID',
  "Postal ID",
  "PRC ID",
  'Senior citizen ID',
  'Company ID',
  'Other government ID',
];

const TABS = [
  { key: 'appointments', label: 'Appointments', icon: 'calendar' },
  { key: 'projects', label: 'Projects', icon: 'folder' },
  { key: 'documents', label: 'Documents', icon: 'file' },
  { key: 'properties', label: 'Properties', icon: 'pin' },
];

function EditClientModal({ open, onClose, client, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() => ({
    fullName: client.fullName || '',
    phone: client.phone || '',
    addressLine: client.profile?.addressLine || '',
    barangay: client.profile?.barangay || '',
    cityMunicipality: client.profile?.cityMunicipality || '',
    province: client.profile?.province || '',
    validIdType: client.profile?.validIdType || '',
    validIdNumber: client.profile?.validIdNumber || '',
    notes: client.profile?.notes || '',
  }));

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.patch(`/admin/clients/${client.id}`, form);
      toast.success('Client profile updated.');
      onSaved();
      onClose();
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Edit client profile"
      subtitle="Contact details, address and identity records are visible only to the office team."
      size="wide"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="edit-client-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="edit-client-form" onSubmit={submit}>
        <div className="form-grid form-grid--2">
          <Field label="Full name" htmlFor="client-name" required error={errors.fullName}>
            <input id="client-name" className="input" value={form.fullName} onChange={set('fullName')} maxLength={150} required />
          </Field>
          <Field label="Mobile / phone" htmlFor="client-phone" error={errors.phone}>
            <input id="client-phone" className="input" value={form.phone} onChange={set('phone')} maxLength={30} placeholder="+63 917 000 0000" />
          </Field>
          <Field label="Email address" htmlFor="client-email" hint="Clients manage their own email in the portal profile.">
            <input id="client-email" className="input" value={client.email} readOnly disabled />
          </Field>
          <Field label="Street address" htmlFor="client-address" error={errors.addressLine}>
            <input id="client-address" className="input" value={form.addressLine} onChange={set('addressLine')} maxLength={255} />
          </Field>
          <Field label="Barangay" htmlFor="client-barangay" error={errors.barangay}>
            <input id="client-barangay" className="input" value={form.barangay} onChange={set('barangay')} maxLength={120} />
          </Field>
          <Field label="City / municipality" htmlFor="client-city" error={errors.cityMunicipality}>
            <input id="client-city" className="input" value={form.cityMunicipality} onChange={set('cityMunicipality')} maxLength={120} />
          </Field>
          <Field label="Province" htmlFor="client-province" error={errors.province}>
            <input id="client-province" className="input" value={form.province} onChange={set('province')} maxLength={120} />
          </Field>
          <Field label="ID type" htmlFor="client-id-type" error={errors.validIdType}>
            <select id="client-id-type" className="select" value={form.validIdType} onChange={set('validIdType')}>
              <option value="">Not recorded</option>
              {ID_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="ID number" htmlFor="client-id-number" error={errors.validIdNumber} hint="Store only what is needed for verification.">
            <input id="client-id-number" className="input" value={form.validIdNumber} onChange={set('validIdNumber')} maxLength={80} />
          </Field>
        </div>
        <Field label="Internal office notes" htmlFor="client-notes" error={errors.notes} hint="Private notes for the office team. Never shown to the client.">
          <textarea id="client-notes" className="textarea" value={form.notes} onChange={set('notes')} maxLength={2000} rows={4} />
        </Field>
      </form>
    </Modal>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('appointments');
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(() => api.get(`/admin/clients/${id}`), [id]);

  const client = data?.client;
  const appointments = data?.appointments || [];
  const projects = data?.projects || [];
  const documents = data?.documents || [];
  const properties = data?.properties || [];

  async function toggleActive() {
    if (!client) return;
    const deactivating = client.isActive;
    const ok = await confirm({
      title: deactivating ? 'Deactivate this client?' : 'Reactivate this client?',
      message: deactivating
        ? `${client.fullName} will be signed out immediately and will not be able to sign in until the account is reactivated. Existing records are kept.`
        : `${client.fullName} will be able to sign in and manage their bookings again.`,
      confirmLabel: deactivating ? 'Deactivate account' : 'Reactivate account',
      danger: deactivating,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.patch(`/admin/clients/${id}`, { isActive: !client.isActive });
      toast.success(deactivating ? 'Client account deactivated.' : 'Client account reactivated.');
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading label="Loading client record…" />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!client) return null;

  const activeProjects = projects.filter((p) => !p.archived);

  return (
    <>
      <PageHead
        title={client.fullName}
        subtitle={`Client account #${client.id} · registered ${dateLabel(client.createdAt)}`}
        back={{ label: 'All clients', onClick: () => navigate('/admin/clients') }}
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setEditOpen(true)}>
              <Icon name="edit" size={16} /> Edit profile
            </button>
            <button type="button" className={client.isActive ? 'btn btn--danger-soft' : 'btn'} onClick={toggleActive} disabled={busy}>
              <Icon name={client.isActive ? 'lock' : 'userCheck'} size={16} />
              {client.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </>
        }
      />

      {!client.isActive ? (
        <Alert tone="warn" title="This account is deactivated">
          The client cannot sign in. Their appointments, projects and documents remain on file.
        </Alert>
      ) : null}

      <div className="stat-grid mb-2">
        <div className="stat">
          <Icon name="calendar" size={28} className="stat__icon" />
          <div className="stat__label">Appointments</div>
          <div className="stat__value">{appointments.length}</div>
          <div className="stat__hint">{appointments.filter((a) => ['pending', 'approved', 'confirmed', 'rescheduling_requested'].includes(a.status)).length} open</div>
        </div>
        <div className="stat">
          <Icon name="folder" size={28} className="stat__icon" />
          <div className="stat__label">Projects</div>
          <div className="stat__value">{projects.length}</div>
          <div className="stat__hint">{activeProjects.length} active</div>
        </div>
        <div className="stat">
          <Icon name="file" size={28} className="stat__icon" />
          <div className="stat__label">Documents</div>
          <div className="stat__value">{documents.length}</div>
          <div className="stat__hint">{documents.filter((d) => d.status === 'rejected').length} need attention</div>
        </div>
        <div className="stat">
          <Icon name="pin" size={28} className="stat__icon" />
          <div className="stat__label">Properties</div>
          <div className="stat__value">{properties.length}</div>
          <div className="stat__hint">On record</div>
        </div>
      </div>

      <div className="split split--wide-left">
        <div className="stack">
          <Card flush>
            <div style={{ padding: '.6rem .9rem 0' }}>
              <Tabs
                tabs={TABS.map((item) => ({
                  ...item,
                  count:
                    item.key === 'appointments'
                      ? appointments.length
                      : item.key === 'projects'
                        ? projects.length
                        : item.key === 'documents'
                          ? documents.length
                          : properties.length,
                }))}
                value={tab}
                onChange={setTab}
              />
            </div>

            {tab === 'appointments' ? (
              appointments.length ? (
                <div className="table-wrap">
                  <table className="table table--cards">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Service</th>
                        <th>Schedule</th>
                        <th>Surveyor</th>
                        <th>Fee</th>
                        <th>Status</th>
                        <th aria-label="Open" />
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.map((appointment) => (
                        <tr key={appointment.id}>
                          <td data-label="Reference"><span className="cell-main mono tiny">{appointment.referenceNo}</span></td>
                          <td data-label="Service"><span className="small">{appointment.serviceName}</span></td>
                          <td data-label="Schedule">
                            <span className="small">{dateLabel(appointment.date)}</span>
                            <span className="cell-sub">{timeLabel(appointment.time)}</span>
                          </td>
                          <td data-label="Surveyor"><span className="small">{appointment.surveyorName || 'Unassigned'}</span></td>
                          <td data-label="Fee"><span className="small">{money(appointment.fee)}</span></td>
                          <td data-label="Status"><StatusBadge status={appointment.status} /></td>
                          <td data-label="" className="cell-actions">
                            <Link className="btn btn--secondary btn--xs" to={`/admin/appointments/${appointment.id}`}>View</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="calendar" title="No appointments" message="This client has not requested a survey yet." />
              )
            ) : null}

            {tab === 'projects' ? (
              projects.length ? (
                <div className="table-wrap">
                  <table className="table table--cards">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Service</th>
                        <th>Progress</th>
                        <th>Stage</th>
                        <th aria-label="Open" />
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((project) => (
                        <tr key={project.id}>
                          <td data-label="Project">
                            <Link className="cell-main mono tiny" to={`/admin/projects/${project.id}`}>{project.projectNo}</Link>
                            {project.archived ? <span className="cell-sub">Archived</span> : null}
                          </td>
                          <td data-label="Service"><span className="small">{project.serviceName}</span></td>
                          <td data-label="Progress" style={{ minWidth: 130 }}><Progress value={project.progressPercent} showLabel /></td>
                          <td data-label="Stage"><Badge tone={stageTone(project.stage)}>{project.stageLabel}</Badge></td>
                          <td data-label="" className="cell-actions">
                            <Link className="btn btn--secondary btn--xs" to={`/admin/projects/${project.id}`}>Open</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="folder" title="No projects yet" message="A project is created automatically when an appointment request is approved." />
              )
            ) : null}

            {tab === 'documents' ? (
              documents.length ? (
                <div className="table-wrap">
                  <table className="table table--cards">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Category</th>
                        <th>Version</th>
                        <th>Size</th>
                        <th>Uploaded</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((document) => (
                        <tr key={document.id}>
                          <td data-label="Document">
                            <span className="cell-main">{document.title}</span>
                            <span className="cell-sub">{document.original_name}</span>
                          </td>
                          <td data-label="Category"><span className="small">{document.category}</span></td>
                          <td data-label="Version"><span className="small">v{document.version}</span></td>
                          <td data-label="Size"><span className="small">{document.size}</span></td>
                          <td data-label="Uploaded"><span className="small">{dateLabel(document.created_at)}</span></td>
                          <td data-label="Status"><StatusBadge status={document.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="file" title="No documents" message="Files uploaded by this client will be listed here for review." />
              )
            ) : null}

            {tab === 'properties' ? (
              properties.length ? (
                <div className="stack" style={{ padding: '.9rem' }}>
                  {properties.map((property) => (
                    <div key={property.id} className="panel">
                      <div className="flex items-start justify-between gap-1 wrap">
                        <div>
                          <b className="small">
                            {property.lot_no ? `Lot ${property.lot_no}` : 'Property record'}
                            {property.title_no ? ` · TCT ${property.title_no}` : ''}
                          </b>
                          <div className="tiny muted">
                            {[property.barangay && `Brgy. ${property.barangay}`, property.city_municipality, property.province]
                              .filter(Boolean)
                              .join(', ') || 'No address recorded'}
                          </div>
                        </div>
                        <div className="right">
                          <div className="small strong">{property.area_sqm ? `${Number(property.area_sqm).toLocaleString('en-PH')} sqm` : '—'}</div>
                          <div className="tiny muted">Added {dateLabel(property.created_at)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon="pin" title="No properties" message="Property details are captured when the client books a survey." />
              )
            ) : null}
          </Card>
        </div>

        <div className="detail-side">
          <Card>
            <div className="flex items-center gap-1" style={{ marginBottom: '.8rem' }}>
              <Avatar name={client.fullName} size="lg" tone={client.clientType === 'company' ? 'navy' : ''} />
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block' }}>{client.fullName}</b>
                <span className="tiny muted">{client.email}</span>
                <div className="mt-1">
                  <Badge tone={client.isActive ? 'green' : 'slate'}>{client.isActive ? 'Active account' : 'Deactivated'}</Badge>
                </div>
              </div>
            </div>
            <InfoRow label="Phone">{client.phone || '—'}</InfoRow>
            <InfoRow label="Client type">{client.profile?.clientType || 'individual'}</InfoRow>
            {client.profile?.companyName ? <InfoRow label="Company">{client.profile.companyName}</InfoRow> : null}
            <InfoRow label="Address">
              {[client.profile?.addressLine, client.profile?.barangay, client.profile?.cityMunicipality, client.profile?.province]
                .filter(Boolean)
                .join(', ') || '—'}
            </InfoRow>
            <InfoRow label="Valid ID">
              {client.profile?.validIdType
                ? `${client.profile.validIdType}${client.profile.validIdNumber ? ` · ${client.profile.validIdNumber}` : ''}`
                : 'Not recorded'}
            </InfoRow>
            <InfoRow label="Last sign-in">{client.lastLoginAt ? dateTimeLabel(client.lastLoginAt) : 'Never'}</InfoRow>
            <InfoRow label="Privacy consent">
              {client.privacyAcceptedAt ? dateLabel(client.privacyAcceptedAt) : 'Not recorded'}
            </InfoRow>
            <div className="mt-2">
              <Link className="btn btn--secondary btn--block btn--sm" to={`/admin/appointments?q=${encodeURIComponent(client.email)}`}>
                <Icon name="calendar" size={15} /> Find appointments
              </Link>
            </div>
          </Card>

          <Card>
            <SectionTitle title="Office notes" />
            {client.profile?.notes ? (
              <p className="small wrap-anywhere" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{client.profile.notes}</p>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>No internal notes for this client yet.</p>
            )}
            <button type="button" className="btn btn--secondary btn--sm btn--block mt-2" onClick={() => setEditOpen(true)}>
              <Icon name="edit" size={15} /> Add or edit notes
            </button>
          </Card>

          <Card>
            <SectionTitle title="Data privacy" />
            <p className="tiny muted" style={{ margin: 0 }}>
              Identity and contact details are processed only for surveying engagements and are kept for the retention
              period stated in the privacy notice. Do not share these records outside the office.
            </p>
          </Card>
        </div>
      </div>

      {editOpen ? (
        <EditClientModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          client={client}
          onSaved={() => reload(true)}
        />
      ) : null}
    </>
  );
}
