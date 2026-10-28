import { useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Alert,
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  Tabs,
  useConfirm,
  useToast,
} from '../../components/ui.jsx';
import { dateLabel, money, titleCase } from '../../utils.js';

const TABS = [
  { key: 'services', label: 'Services', icon: 'ruler' },
  { key: 'fees', label: 'Fee schedule', icon: 'chart' },
  { key: 'requirements', label: 'Document checklist', icon: 'clipboard' },
];

const CATEGORIES = ['survey', 'documentation', 'consultation'];

function ServiceFormModal({ open, onClose, service, onSaved }) {
  const toast = useToast();
  const editing = !!service;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() => ({
    code: service?.code || '',
    name: service?.name || '',
    shortName: service?.shortName || '',
    description: service?.description || '',
    category: service?.category || 'survey',
    baseFee: service?.baseFee ?? 0,
    durationMinutes: service?.durationMinutes ?? 120,
    requiresFieldwork: service?.requiresFieldwork ?? true,
    turnaroundDays: service?.turnaroundDays ?? 14,
    isActive: service?.isActive ?? true,
    sortOrder: service?.sortOrder ?? 0,
  }));

  const set = (key) => (event) => {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      ...form,
      baseFee: Number(form.baseFee) || 0,
      durationMinutes: Number(form.durationMinutes) || 120,
      turnaroundDays: Number(form.turnaroundDays) || 14,
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      if (editing) {
        await api.patch(`/admin/services/${service.id}`, payload);
        toast.success('Service updated.');
      } else {
        await api.post('/admin/services', payload);
        toast.success('Service created.');
      }
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
      title={editing ? `Edit ${service.name}` : 'Add a service'}
      subtitle="Services appear on the public website and in the booking wizard."
      size="wide"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="service-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create service'}
          </button>
        </>
      }
    >
      <form id="service-form" onSubmit={submit}>
        <div className="form-grid form-grid--2">
          <Field label="Service code" htmlFor="service-code" required error={errors.code} hint="Short unique code, e.g. RELOCATION.">
            <input id="service-code" className="input mono" value={form.code} onChange={set('code')} maxLength={30} required />
          </Field>
          <Field label="Category" htmlFor="service-category" required error={errors.category}>
            <select id="service-category" className="select" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{titleCase(category)}</option>
              ))}
            </select>
          </Field>
          <Field label="Service name" htmlFor="service-name" required error={errors.name}>
            <input id="service-name" className="input" value={form.name} onChange={set('name')} maxLength={150} required />
          </Field>
          <Field label="Short name" htmlFor="service-short" error={errors.shortName} hint="Used on compact cards and reports.">
            <input id="service-short" className="input" value={form.shortName} onChange={set('shortName')} maxLength={60} />
          </Field>
          <Field label="Base fee (PHP)" htmlFor="service-fee" required error={errors.baseFee}>
            <input id="service-fee" className="input" type="number" min={0} step="0.01" value={form.baseFee} onChange={set('baseFee')} />
          </Field>
          <Field label="Field duration (minutes)" htmlFor="service-duration" error={errors.durationMinutes} hint="Blocks time in the schedule and conflict checker.">
            <input id="service-duration" className="input" type="number" min={30} max={600} step={15} value={form.durationMinutes} onChange={set('durationMinutes')} />
          </Field>
          <Field label="Turnaround (days)" htmlFor="service-turnaround" error={errors.turnaroundDays}>
            <input id="service-turnaround" className="input" type="number" min={1} max={365} value={form.turnaroundDays} onChange={set('turnaroundDays')} />
          </Field>
          <Field label="Sort order" htmlFor="service-sort" error={errors.sortOrder} hint="Lower numbers appear first on the website.">
            <input id="service-sort" className="input" type="number" min={0} max={999} value={form.sortOrder} onChange={set('sortOrder')} />
          </Field>
        </div>
        <Field label="Description" htmlFor="service-description" error={errors.description}>
          <textarea id="service-description" className="textarea" rows={4} value={form.description} onChange={set('description')} maxLength={2000} />
        </Field>
        <div className="toggle-row">
          <div>
            <b className="small">Requires fieldwork</b>
            <div className="tiny muted">Adds a site visit and travel considerations to the booking.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.requiresFieldwork} onChange={set('requiresFieldwork')} aria-label="Requires fieldwork" />
            <span />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <b className="small">Bookable on the website</b>
            <div className="tiny muted">Inactive services remain on old records but cannot be booked.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.isActive} onChange={set('isActive')} aria-label="Service is active" />
            <span />
          </label>
        </div>
      </form>
    </Modal>
  );
}

function FeeFormModal({ open, onClose, fee, services, defaultServiceId, onSaved }) {
  const toast = useToast();
  const editing = !!fee;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() => ({
    serviceId: fee?.serviceId || defaultServiceId || services[0]?.id || '',
    name: fee?.name || '',
    description: fee?.description || '',
    amount: fee?.amount ?? 0,
    isOptional: fee?.isOptional ?? false,
    isActive: fee?.isActive ?? true,
    effectiveFrom: fee?.effectiveFrom ? String(fee.effectiveFrom).slice(0, 10) : '',
  }));

  const set = (key) => (event) => {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      serviceId: Number(form.serviceId),
      name: form.name,
      description: form.description,
      amount: Number(form.amount) || 0,
      isOptional: form.isOptional,
      isActive: form.isActive,
      effectiveFrom: form.effectiveFrom || null,
    };
    try {
      if (editing) {
        await api.patch(`/admin/service-fees/${fee.id}`, payload);
        toast.success('Fee updated.');
      } else {
        await api.post('/admin/service-fees', payload);
        toast.success('Fee added.');
      }
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
      title={editing ? `Edit ${fee.name}` : 'Add a fee line'}
      subtitle="Fee lines help staff prepare consistent quotes. They do not replace a formal contract."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="fee-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add fee'}
          </button>
        </>
      }
    >
      <form id="fee-form" onSubmit={submit}>
        <Field label="Service" htmlFor="fee-service" required error={errors.serviceId}>
          <select id="fee-service" className="select" value={form.serviceId} onChange={set('serviceId')} required>
            <option value="">Select a service…</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Fee name" htmlFor="fee-name" required error={errors.name}>
          <input id="fee-name" className="input" value={form.name} onChange={set('name')} maxLength={150} required />
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="Amount (PHP)" htmlFor="fee-amount" required error={errors.amount}>
            <input id="fee-amount" className="input" type="number" min={0} step="0.01" value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="Effective from" htmlFor="fee-effective" error={errors.effectiveFrom}>
            <input id="fee-effective" className="input" type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} />
          </Field>
        </div>
        <Field label="Description" htmlFor="fee-description" error={errors.description}>
          <input id="fee-description" className="input" value={form.description} onChange={set('description')} maxLength={255} />
        </Field>
        <div className="toggle-row">
          <div>
            <b className="small">Optional line item</b>
            <div className="tiny muted">Mark items that may be added to a quote when needed.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.isOptional} onChange={set('isOptional')} aria-label="Optional fee" />
            <span />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <b className="small">Active</b>
            <div className="tiny muted">Archived fees stay on historical quotes.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.isActive} onChange={set('isActive')} aria-label="Fee is active" />
            <span />
          </label>
        </div>
      </form>
    </Modal>
  );
}

function RequirementFormModal({ open, onClose, requirement, services, onSaved }) {
  const toast = useToast();
  const editing = !!requirement;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() => ({
    serviceId: requirement?.serviceId || '',
    code: requirement?.code || '',
    name: requirement?.name || '',
    description: requirement?.description || '',
    isRequired: requirement?.isRequired ?? true,
    allowedTypes: requirement?.allowedTypes || 'pdf,jpg,jpeg,png',
    maxSizeMb: requirement?.maxSizeMb ?? 15,
    sortOrder: requirement?.sortOrder ?? 0,
    isActive: requirement?.isActive ?? true,
  }));

  const set = (key) => (event) => {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      serviceId: form.serviceId ? Number(form.serviceId) : null,
      code: form.code,
      name: form.name,
      description: form.description,
      isRequired: form.isRequired,
      allowedTypes: form.allowedTypes,
      maxSizeMb: Number(form.maxSizeMb) || 15,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await api.patch(`/admin/document-requirements/${requirement.id}`, payload);
        toast.success('Document requirement updated.');
      } else {
        await api.post('/admin/document-requirements', payload);
        toast.success('Document requirement created.');
      }
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
      title={editing ? `Edit ${requirement.name}` : 'Add a document requirement'}
      subtitle="Requirements appear in the client checklist for the selected service."
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="requirement-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add requirement'}
          </button>
        </>
      }
    >
      <form id="requirement-form" onSubmit={submit}>
        <Field label="Applies to" htmlFor="requirement-service" error={errors.serviceId}>
          <select id="requirement-service" className="select" value={form.serviceId} onChange={set('serviceId')}>
            <option value="">All services</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="Requirement code" htmlFor="requirement-code" required error={errors.code} hint="e.g. TCT_COPY">
            <input id="requirement-code" className="input mono" value={form.code} onChange={set('code')} maxLength={60} required />
          </Field>
          <Field label="Display name" htmlFor="requirement-name" required error={errors.name}>
            <input id="requirement-name" className="input" value={form.name} onChange={set('name')} maxLength={160} required />
          </Field>
          <Field label="Allowed file types" htmlFor="requirement-types" error={errors.allowedTypes} hint="Comma-separated extensions.">
            <input id="requirement-types" className="input" value={form.allowedTypes} onChange={set('allowedTypes')} maxLength={160} />
          </Field>
          <Field label="Maximum size (MB)" htmlFor="requirement-size" error={errors.maxSizeMb}>
            <input id="requirement-size" className="input" type="number" min={1} max={60} value={form.maxSizeMb} onChange={set('maxSizeMb')} />
          </Field>
          <Field label="Sort order" htmlFor="requirement-sort" error={errors.sortOrder}>
            <input id="requirement-sort" className="input" type="number" min={0} max={999} value={form.sortOrder} onChange={set('sortOrder')} />
          </Field>
        </div>
        <Field label="Client instructions" htmlFor="requirement-description" error={errors.description}>
          <textarea id="requirement-description" className="textarea" rows={3} value={form.description} onChange={set('description')} maxLength={500} />
        </Field>
        <div className="toggle-row">
          <div>
            <b className="small">Required for booking</b>
            <div className="tiny muted">Clients see missing required items as tasks to resolve.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.isRequired} onChange={set('isRequired')} aria-label="Required" />
            <span />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <b className="small">Active</b>
            <div className="tiny muted">Inactive requirements stop appearing for new bookings.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.isActive} onChange={set('isActive')} aria-label="Requirement is active" />
            <span />
          </label>
        </div>
      </form>
    </Modal>
  );
}

export default function Services() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('services');
  const [serviceModal, setServiceModal] = useState(null); // null | {} | service
  const [feeModal, setFeeModal] = useState(null);
  const [requirementModal, setRequirementModal] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const servicesState = useAsync(() => api.get('/admin/services'), []);
  const feesState = useAsync(() => api.get('/admin/service-fees'), []);
  const requirementsState = useAsync(() => api.get('/admin/document-requirements'), []);

  const services = servicesState.data?.services || [];
  const fees = feesState.data?.fees || [];
  const requirements = requirementsState.data?.requirements || [];
  const loading = servicesState.loading || feesState.loading || requirementsState.loading;
  const error = servicesState.error || feesState.error || requirementsState.error;

  function reloadAll() {
    servicesState.reload(true);
    feesState.reload(true);
    requirementsState.reload(true);
  }

  async function toggleService(service) {
    const deactivating = service.isActive;
    const ok = await confirm({
      title: deactivating ? 'Remove from website?' : 'Make bookable again?',
      message: deactivating
        ? `"${service.name}" will no longer appear on the public website or booking wizard. Existing bookings are unaffected.`
        : `"${service.name}" will be available for new bookings on the website.`,
      confirmLabel: deactivating ? 'Deactivate service' : 'Activate service',
      danger: deactivating,
    });
    if (!ok) return;
    setBusyId(`service-${service.id}`);
    try {
      await api.patch(`/admin/services/${service.id}`, { isActive: !service.isActive });
      toast.success(deactivating ? 'Service deactivated.' : 'Service activated.');
      await servicesState.reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function archiveFee(fee) {
    const ok = await confirm({
      title: 'Archive this fee?',
      message: `"${fee.name}" will stop appearing in the fee schedule. Historical quotes keep their original amounts.`,
      confirmLabel: 'Archive fee',
      danger: true,
    });
    if (!ok) return;
    setBusyId(`fee-${fee.id}`);
    try {
      await api.del(`/admin/service-fees/${fee.id}`);
      toast.success('Fee archived.');
      await feesState.reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function archiveRequirement(requirement) {
    const ok = await confirm({
      title: 'Archive this requirement?',
      message: `"${requirement.name}" will stop appearing in new client checklists. Files already uploaded stay on record.`,
      confirmLabel: 'Archive requirement',
      danger: true,
    });
    if (!ok) return;
    setBusyId(`req-${requirement.id}`);
    try {
      await api.del(`/admin/document-requirements/${requirement.id}`);
      toast.success('Requirement archived.');
      await requirementsState.reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHead
        title="Services, fees & requirements"
        subtitle="Keep the public catalogue, quote lines and client document checklist in step with office practice."
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (tab === 'services') setServiceModal({});
              else if (tab === 'fees') setFeeModal({});
              else setRequirementModal({});
            }}
          >
            <Icon name="plus" size={16} />
            {tab === 'services' ? 'Add service' : tab === 'fees' ? 'Add fee' : 'Add requirement'}
          </button>
        }
      />

      <Card flush className="mb-2">
        <div style={{ padding: '.6rem .9rem 0' }}>
          <Tabs
            tabs={TABS.map((item) => ({
              ...item,
              count: item.key === 'services' ? services.length : item.key === 'fees' ? fees.length : requirements.length,
            }))}
            value={tab}
            onChange={setTab}
          />
        </div>
      </Card>

      {loading && !services.length ? <Loading label="Loading service catalogue…" /> : null}
      {error ? <ErrorState error={error} onRetry={reloadAll} /> : null}

      {tab === 'services' ? (
        <>
          {!loading && !services.length ? (
            <Card>
              <Empty
                icon="ruler"
                title="No services configured"
                message="Add at least one service so clients can request a survey."
                action={<button type="button" className="btn" onClick={() => setServiceModal({})}><Icon name="plus" size={16} /> Add service</button>}
              />
            </Card>
          ) : null}
          {services.length ? (
            <Card flush>
              <div className="table-wrap">
                <table className="table table--cards">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Category</th>
                      <th>Base fee</th>
                      <th>Field time</th>
                      <th>Checklist</th>
                      <th>Bookings</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((service) => (
                      <tr key={service.id}>
                        <td data-label="Service">
                          <span className="cell-main">{service.name}</span>
                          <span className="cell-sub mono">{service.code}</span>
                        </td>
                        <td data-label="Category"><span className="small">{titleCase(service.category)}</span></td>
                        <td data-label="Base fee"><span className="small strong">{money(service.baseFee)}</span></td>
                        <td data-label="Field time"><span className="small">{service.durationMinutes} min</span></td>
                        <td data-label="Checklist"><span className="small">{service.requirementCount} items</span></td>
                        <td data-label="Bookings"><span className="small">{service.bookingCount}</span></td>
                        <td data-label="Status">
                          <Badge tone={service.isActive ? 'green' : 'slate'}>{service.isActive ? 'Bookable' : 'Hidden'}</Badge>
                        </td>
                        <td data-label="" className="cell-actions">
                          <div className="table-actions">
                            <button type="button" className="btn btn--secondary btn--xs" onClick={() => setServiceModal(service)}>
                              <Icon name="edit" size={13} /> Edit
                            </button>
                            <button
                              type="button"
                              className={service.isActive ? 'btn btn--danger-soft btn--xs' : 'btn btn--xs'}
                              onClick={() => toggleService(service)}
                              disabled={busyId === `service-${service.id}`}
                            >
                              {service.isActive ? 'Hide' : 'Publish'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Alert tone="info" title="How fees are used">
            The base fee is shown on the website and pre-fills the booking estimate. Final quotes may differ after the site
            assessment. Clients always see the estimate before submitting a request.
          </Alert>
        </>
      ) : null}

      {tab === 'fees' ? (
        <>
          {!loading && !fees.length ? (
            <Card>
              <Empty
                icon="chart"
                title="No fee lines yet"
                message="Add fee lines for mobilisation, processing and other common charges."
                action={<button type="button" className="btn" onClick={() => setFeeModal({})}><Icon name="plus" size={16} /> Add fee</button>}
              />
            </Card>
          ) : null}
          {fees.length ? (
            <Card flush>
              <div className="table-wrap">
                <table className="table table--cards">
                  <thead>
                    <tr>
                      <th>Fee</th>
                      <th>Service</th>
                      <th>Amount</th>
                      <th>Type</th>
                      <th>Effective from</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee) => (
                      <tr key={fee.id}>
                        <td data-label="Fee">
                          <span className="cell-main">{fee.name}</span>
                          {fee.description ? <span className="cell-sub">{fee.description}</span> : null}
                        </td>
                        <td data-label="Service"><span className="small">{fee.serviceName}</span></td>
                        <td data-label="Amount"><span className="small strong">{money(fee.amount, { cents: true })}</span></td>
                        <td data-label="Type"><Badge tone={fee.isOptional ? 'blue' : 'slate'}>{fee.isOptional ? 'Optional' : 'Standard'}</Badge></td>
                        <td data-label="Effective from"><span className="small">{fee.effectiveFrom ? dateLabel(fee.effectiveFrom) : 'Immediate'}</span></td>
                        <td data-label="Status"><Badge tone={fee.isActive ? 'green' : 'slate'}>{fee.isActive ? 'Active' : 'Archived'}</Badge></td>
                        <td data-label="" className="cell-actions">
                          <div className="table-actions">
                            <button type="button" className="btn btn--secondary btn--xs" onClick={() => setFeeModal(fee)}>
                              <Icon name="edit" size={13} /> Edit
                            </button>
                            {fee.isActive ? (
                              <button
                                type="button"
                                className="btn btn--danger-soft btn--xs"
                                onClick={() => archiveFee(fee)}
                                disabled={busyId === `fee-${fee.id}`}
                              >
                                Archive
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'requirements' ? (
        <>
          {!loading && !requirements.length ? (
            <Card>
              <Empty
                icon="clipboard"
                title="No document requirements"
                message="Add the documents clients must submit for each service."
                action={<button type="button" className="btn" onClick={() => setRequirementModal({})}><Icon name="plus" size={16} /> Add requirement</button>}
              />
            </Card>
          ) : null}
          {requirements.length ? (
            <Card flush>
              <div className="table-wrap">
                <table className="table table--cards">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Applies to</th>
                      <th>Required</th>
                      <th>Accepted files</th>
                      <th>Max size</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((requirement) => (
                      <tr key={requirement.id}>
                        <td data-label="Requirement">
                          <span className="cell-main">{requirement.name}</span>
                          <span className="cell-sub mono">{requirement.code}</span>
                        </td>
                        <td data-label="Applies to"><span className="small">{requirement.serviceName}</span></td>
                        <td data-label="Required"><Badge tone={requirement.isRequired ? 'amber' : 'slate'}>{requirement.isRequired ? 'Required' : 'Optional'}</Badge></td>
                        <td data-label="Accepted files"><span className="small mono">{requirement.allowedTypes}</span></td>
                        <td data-label="Max size"><span className="small">{requirement.maxSizeMb} MB</span></td>
                        <td data-label="Status"><Badge tone={requirement.isActive ? 'green' : 'slate'}>{requirement.isActive ? 'Active' : 'Archived'}</Badge></td>
                        <td data-label="" className="cell-actions">
                          <div className="table-actions">
                            <button type="button" className="btn btn--secondary btn--xs" onClick={() => setRequirementModal(requirement)}>
                              <Icon name="edit" size={13} /> Edit
                            </button>
                            {requirement.isActive ? (
                              <button
                                type="button"
                                className="btn btn--danger-soft btn--xs"
                                onClick={() => archiveRequirement(requirement)}
                                disabled={busyId === `req-${requirement.id}`}
                              >
                                Archive
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <Alert tone="info" title="Document review stays manual">
            Uploaded files are checked by staff before a project can move to the next stage. Clients receive an in-app
            notification when a document is approved or needs replacing.
          </Alert>
        </>
      ) : null}

      {serviceModal ? (
        <ServiceFormModal
          open={!!serviceModal}
          onClose={() => setServiceModal(null)}
          service={serviceModal.id ? serviceModal : null}
          onSaved={reloadAll}
        />
      ) : null}

      {feeModal ? (
        <FeeFormModal
          open={!!feeModal}
          onClose={() => setFeeModal(null)}
          fee={feeModal.id ? feeModal : null}
          services={services}
          onSaved={reloadAll}
        />
      ) : null}

      {requirementModal ? (
        <RequirementFormModal
          open={!!requirementModal}
          onClose={() => setRequirementModal(null)}
          requirement={requirementModal.id ? requirementModal : null}
          services={services}
          onSaved={reloadAll}
        />
      ) : null}
    </>
  );
}
