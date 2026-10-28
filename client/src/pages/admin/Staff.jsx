import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { useAuth } from '../../auth.jsx';
import { Icon } from '../../components/Icons.jsx';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  SearchInput,
  useConfirm,
  useToast,
} from '../../components/ui.jsx';
import { copyText, dateLabel, relativeTime } from '../../utils.js';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  role: 'surveyor',
  employeeNo: '',
  position: '',
  licenseNo: '',
  specialization: '',
  maxDailyProjects: 3,
  hireDate: '',
};

function StaffFormModal({ open, onClose, staff, onSaved }) {
  const toast = useToast();
  const editing = !!staff;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() =>
    staff
      ? {
          fullName: staff.fullName || '',
          email: staff.email || '',
          phone: staff.phone || '',
          role: staff.role || 'surveyor',
          employeeNo: staff.employeeNo || '',
          position: staff.position || '',
          licenseNo: staff.licenseNo || '',
          specialization: staff.specialization || '',
          maxDailyProjects: staff.maxDailyProjects ?? 3,
          hireDate: staff.hireDate ? String(staff.hireDate).slice(0, 10) : '',
        }
      : { ...EMPTY_FORM },
  );

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      fullName: form.fullName,
      phone: form.phone,
      role: form.role,
      employeeNo: form.employeeNo || undefined,
      position: form.position || undefined,
      licenseNo: form.licenseNo || undefined,
      specialization: form.specialization || undefined,
      maxDailyProjects: Number(form.maxDailyProjects) || 3,
      hireDate: form.hireDate || null,
    };
    if (!editing) {
      payload.email = form.email;
      payload.password = form.password;
    }
    try {
      if (editing) {
        await api.patch(`/admin/staff/${staff.id}`, payload);
        toast.success('Staff account updated.');
      } else {
        const result = await api.post('/admin/staff', payload);
        toast.success(result.message || 'Staff account created.');
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
      title={editing ? `Edit ${staff.fullName}` : 'Add a staff account'}
      subtitle={
        editing
          ? 'Update the office record. Email addresses and passwords are managed separately for security.'
          : 'Create a surveyor or administrator login. Share the temporary password securely — it cannot be retrieved later.'
      }
      size="wide"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="staff-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit}>
        <div className="form-grid form-grid--2">
          <Field label="Full name" htmlFor="staff-name" required error={errors.fullName}>
            <input id="staff-name" className="input" value={form.fullName} onChange={set('fullName')} maxLength={150} required />
          </Field>
          <Field label="Role" htmlFor="staff-role" required error={errors.role} hint="Surveyors only see their assigned fieldwork and projects.">
            <select id="staff-role" className="select" value={form.role} onChange={set('role')}>
              <option value="surveyor">Surveyor / field staff</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          {!editing ? (
            <>
              <Field label="Email address" htmlFor="staff-email" required error={errors.email}>
                <input
                  id="staff-email"
                  className="input"
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={set('email')}
                  maxLength={190}
                  required
                />
              </Field>
              <Field
                label="Temporary password"
                htmlFor="staff-password"
                required
                error={errors.password}
                hint="At least 10 characters, including a letter and a number."
              >
                <input
                  id="staff-password"
                  className="input"
                  type="text"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set('password')}
                  minLength={10}
                  maxLength={128}
                  required
                />
              </Field>
            </>
          ) : (
            <Field label="Email address" htmlFor="staff-email-readonly" hint="Email cannot be changed here.">
              <input id="staff-email-readonly" className="input" value={form.email} readOnly disabled />
            </Field>
          )}
          <Field label="Mobile / phone" htmlFor="staff-phone" error={errors.phone}>
            <input id="staff-phone" className="input" value={form.phone} onChange={set('phone')} maxLength={30} />
          </Field>
          <Field label="Employee number" htmlFor="staff-employee-no" error={errors.employeeNo}>
            <input id="staff-employee-no" className="input" value={form.employeeNo} onChange={set('employeeNo')} maxLength={30} />
          </Field>
          <Field label="Position / title" htmlFor="staff-position" error={errors.position}>
            <input id="staff-position" className="input" value={form.position} onChange={set('position')} maxLength={100} placeholder="Licensed Geodetic Engineer" />
          </Field>
          <Field label="PRC license number" htmlFor="staff-license" error={errors.licenseNo}>
            <input id="staff-license" className="input" value={form.licenseNo} onChange={set('licenseNo')} maxLength={60} />
          </Field>
          <Field label="Specialisation" htmlFor="staff-specialization" error={errors.specialization}>
            <input
              id="staff-specialization"
              className="input"
              value={form.specialization}
              onChange={set('specialization')}
              maxLength={160}
              placeholder="Subdivision, topography, title verification…"
            />
          </Field>
          <Field label="Maximum bookings per day" htmlFor="staff-max-daily" error={errors.maxDailyProjects} hint="Used by the conflict checker when approving requests.">
            <input
              id="staff-max-daily"
              className="input"
              type="number"
              min={1}
              max={20}
              value={form.maxDailyProjects}
              onChange={set('maxDailyProjects')}
            />
          </Field>
          <Field label="Hire date" htmlFor="staff-hire" error={errors.hireDate}>
            <input id="staff-hire" className="input" type="date" value={form.hireDate} onChange={set('hireDate')} />
          </Field>
        </div>
        {!editing ? (
          <Alert tone="info">
            Email delivery is not configured on this installation. Give the temporary password to the staff member in person or
            through a secure channel; they will be asked to change it at first sign-in.
          </Alert>
        ) : null}
      </form>
    </Modal>
  );
}

function PasswordRevealModal({ open, onClose, account, password }) {
  const toast = useToast();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Temporary password generated"
      subtitle={`For ${account?.fullName || 'the selected account'}`}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          I have saved it
        </button>
      }
    >
      <p className="small" style={{ marginTop: 0 }}>
        Share this password securely. It is shown only once. All of this person&apos;s existing sessions have been signed out.
      </p>
      <div className="code-box" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <code style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{password}</code>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={async () => {
            const ok = await copyText(password);
            if (ok) toast.success('Password copied.');
            else toast.error('Could not copy. Select the password and copy it manually.');
          }}
        >
          <Icon name="copy" size={15} /> Copy
        </button>
      </div>
      <Alert tone="warn" title="Keep this window private">
        Do not send passwords over unencrypted email or group chats. The staff member must choose a new password after signing in.
      </Alert>
    </Modal>
  );
}

export default function Staff() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [formFor, setFormFor] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, reload } = useAsync(() => api.get('/admin/staff'), []);
  const staff = data?.staff || [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return staff;
    return staff.filter((person) =>
      [person.fullName, person.email, person.position, person.employeeNo, person.specialization]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [staff, q]);

  function openCreate() {
    setFormFor(null);
    setFormOpen(true);
  }

  function openEdit(person) {
    setFormFor(person);
    setFormOpen(true);
  }

  async function toggleActive(person) {
    const deactivating = person.isActive;
    const ok = await confirm({
      title: deactivating ? `Deactivate ${person.fullName}?` : `Reactivate ${person.fullName}?`,
      message: deactivating
        ? 'They will be signed out immediately, removed from assignment pickers and unable to sign in. Their project history is kept.'
        : 'They will be able to sign in and receive assignments again.',
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
      danger: deactivating,
    });
    if (!ok) return;
    setBusyId(person.id);
    try {
      await api.patch(`/admin/staff/${person.id}`, { isActive: !person.isActive });
      toast.success(deactivating ? 'Staff account deactivated.' : 'Staff account reactivated.');
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(person) {
    const ok = await confirm({
      title: 'Reset password?',
      message: `A new temporary password will be generated for ${person.fullName}. Every existing session will be signed out.`,
      detail: 'The password is shown once and cannot be recovered later. Prefer this over sharing a permanent password.',
      confirmLabel: 'Generate password',
    });
    if (!ok) return;
    setBusyId(person.id);
    try {
      const result = await api.post(`/admin/staff/${person.id}/reset-password`);
      setRevealed({ account: person, password: result.temporaryPassword });
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const surveyors = staff.filter((person) => person.role === 'surveyor');
  const admins = staff.filter((person) => person.role === 'admin');

  return (
    <>
      <PageHead
        title="Surveyors & staff"
        subtitle="Manage fieldwork assignments, daily booking limits and administrator access."
        actions={
          <button type="button" className="btn" onClick={openCreate}>
            <Icon name="plus" size={16} /> Add staff account
          </button>
        }
      />

      <div className="stat-grid mb-2">
        <div className="stat">
          <div className="stat__label">Surveyors</div>
          <div className="stat__value">{surveyors.length}</div>
          <div className="stat__hint">{surveyors.filter((person) => person.isActive).length} active</div>
        </div>
        <div className="stat">
          <div className="stat__label">Administrators</div>
          <div className="stat__value">{admins.length}</div>
          <div className="stat__hint">{admins.filter((person) => person.isActive).length} active</div>
        </div>
        <div className="stat">
          <div className="stat__label">Open assignments</div>
          <div className="stat__value">{surveyors.reduce((sum, person) => sum + person.activeLoad, 0)}</div>
          <div className="stat__hint">Across all surveyors</div>
        </div>
        <div className="stat">
          <div className="stat__label">Projects led</div>
          <div className="stat__value">{surveyors.reduce((sum, person) => sum + person.leadProjects, 0)}</div>
          <div className="stat__hint">Active project leads</div>
        </div>
      </div>

      <Card className="mb-2">
        <div className="filters">
          <div style={{ flex: 2 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search staff name, role, license or specialisation…" label="Search staff" />
          </div>
          <div className="flex items-end">
            <button type="button" className="btn btn--secondary btn--block" onClick={() => reload()} disabled={loading}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
          </div>
        </div>
      </Card>

      {loading && !data ? <Loading label="Loading staff accounts…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !filtered.length ? (
        <Card>
          <Empty
            icon="briefcase"
            title={q ? 'No staff match that search' : 'No staff accounts yet'}
            message={q ? 'Try a different name, license number or role.' : 'Add surveyors so appointment requests can be assigned and scheduled.'}
            action={q ? <button type="button" className="btn btn--secondary" onClick={() => setQ('')}>Clear search</button> : (
              <button type="button" className="btn" onClick={openCreate}>
                <Icon name="plus" size={16} /> Add staff account
              </button>
            )}
          />
        </Card>
      ) : null}

      {filtered.length ? (
        <div className="stack">
          {filtered.map((person) => {
            const isSelf = person.id === user?.id;
            return (
              <Card key={person.id}>
                <div className="flex items-start justify-between gap-1 wrap">
                  <div className="person" style={{ alignItems: 'flex-start' }}>
                    <Avatar name={person.fullName} size="lg" tone={person.role === 'admin' ? 'navy' : ''} />
                    <div style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-1 wrap">
                        <b style={{ fontSize: '1rem' }}>{person.fullName}</b>
                        <Badge tone={person.role === 'admin' ? 'navy' : 'teal'}>
                          {person.role === 'admin' ? 'Administrator' : 'Surveyor'}
                        </Badge>
                        {isSelf ? <Badge tone="slate" dot={false}>You</Badge> : null}
                        <Badge tone={person.isActive ? 'green' : 'slate'}>{person.isActive ? 'Active' : 'Deactivated'}</Badge>
                      </div>
                      <div className="small muted">
                        {person.position || 'Field staff'}
                        {person.licenseNo ? ` · PRC ${person.licenseNo}` : ''}
                        {person.employeeNo ? ` · Employee ${person.employeeNo}` : ''}
                      </div>
                      <div className="tiny muted">
                        {person.email}
                        {person.phone ? ` · ${person.phone}` : ''}
                      </div>
                      {person.specialization ? <div className="tiny muted">{person.specialization}</div> : null}
                    </div>
                  </div>
                  <div className="btn-row">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => openEdit(person)}>
                      <Icon name="edit" size={15} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => resetPassword(person)}
                      disabled={busyId === person.id}
                    >
                      <Icon name="key" size={15} /> Reset password
                    </button>
                    {!isSelf ? (
                      <button
                        type="button"
                        className={person.isActive ? 'btn btn--danger-soft btn--sm' : 'btn btn--sm'}
                        onClick={() => toggleActive(person)}
                        disabled={busyId === person.id}
                      >
                        <Icon name={person.isActive ? 'lock' : 'userCheck'} size={15} />
                        {person.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="kv-grid mt-2">
                  <div className="kv">
                    <span>Open assignments</span>
                    <b>{person.activeLoad}</b>
                  </div>
                  <div className="kv">
                    <span>Daily booking limit</span>
                    <b>{person.maxDailyProjects ?? '—'} per day</b>
                  </div>
                  <div className="kv">
                    <span>Active project leads</span>
                    <b>{person.leadProjects}</b>
                  </div>
                  <div className="kv">
                    <span>Hired</span>
                    <b>{person.hireDate ? dateLabel(person.hireDate) : 'Not recorded'}</b>
                  </div>
                  <div className="kv">
                    <span>Last sign-in</span>
                    <b>{person.lastLoginAt ? relativeTime(person.lastLoginAt) : 'Never'}</b>
                  </div>
                  <div className="kv">
                    <span>Account created</span>
                    <b>{dateLabel(person.createdAt)}</b>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {formOpen ? (
        <StaffFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          staff={formFor}
          onSaved={() => reload(true)}
        />
      ) : null}

      {revealed ? (
        <PasswordRevealModal
          open={!!revealed}
          onClose={() => setRevealed(null)}
          account={revealed.account}
          password={revealed.password}
        />
      ) : null}
    </>
  );
}
