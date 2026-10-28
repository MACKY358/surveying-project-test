// Shared profile, password and active-session management.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import {
  Alert,
  Badge,
  Card,
  Field,
  Loading,
  PageHead,
  SectionTitle,
  StatusBadge,
  useConfirm,
  useToast,
} from './ui.jsx';
import { dateTimeLabel, roleLabel } from '../utils.js';

function deviceLabel(agent) {
  const s = String(agent || '');
  if (!s) return 'Unknown device';
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /Chrome\//.test(s)
      ? 'Chrome'
      : /Firefox\//.test(s)
        ? 'Firefox'
        : /Safari\//.test(s)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(s)
    ? 'Windows'
    : /Android/.test(s)
      ? 'Android'
      : /iPhone|iPad/.test(s)
        ? 'iOS'
        : /Mac OS/.test(s)
          ? 'macOS'
          : /Linux/.test(s)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

export default function ProfileView() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const meState = useAsync(() => api.get('/auth/me'), []);
  const sessionsState = useAsync(() => api.get('/auth/sessions'), []);

  const me = meState.data?.user || user;
  const profile = me?.profile || {};

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    addressLine: '',
    barangay: '',
    cityMunicipality: '',
    province: '',
    postalCode: '',
    validIdType: '',
    validIdNumber: '',
    companyName: '',
    clientType: 'individual',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  useEffect(() => {
    if (!me) return;
    setForm((current) => ({
      ...current,
      fullName: me.fullName || '',
      phone: me.phone || '',
      addressLine: profile.addressLine || '',
      barangay: profile.barangay || '',
      cityMunicipality: profile.cityMunicipality || '',
      province: profile.province || '',
      postalCode: profile.postalCode || '',
      validIdType: profile.validIdType || '',
      validIdNumber: profile.validIdNumber || '',
      companyName: profile.companyName || '',
      clientType: profile.clientType || 'individual',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, meState.data]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFields({});
    try {
      await api.patch('/auth/profile', {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        ...(me?.role === 'client'
          ? {
              addressLine: form.addressLine,
              barangay: form.barangay,
              cityMunicipality: form.cityMunicipality,
              province: form.province,
              postalCode: form.postalCode,
              validIdType: form.validIdType,
              validIdNumber: form.validIdNumber,
              companyName: form.companyName,
              clientType: form.clientType,
            }
          : {}),
      });
      await refresh();
      toast.success('Your profile has been saved.');
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setSaving(false);
    }
  }

  async function revoke(session) {
    const ok = await confirm({
      title: 'Sign out this device?',
      message: `${deviceLabel(session.userAgent)} will need to sign in again.`,
      confirmLabel: 'Sign out device',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/auth/sessions/${encodeURIComponent(session.id)}`);
      toast.success('That session has been signed out.');
      await sessionsState.reload(true);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <PageHead
        title="My profile"
        subtitle="Keep your contact details current so the office can reach you about fieldwork and documents."
      />

      {me?.mustChangePassword ? (
        <Alert tone="warn" title="Temporary password active">
          You are still using a temporary password. Change it below before continuing work.
        </Alert>
      ) : null}

      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div className="stack">
          <Card>
            <div className="flex items-center gap-1 wrap mb-2">
              <span className="avatar avatar--lg">{me?.initials || (me?.fullName || '?').slice(0, 1)}</span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{me?.fullName}</h2>
                <div className="muted small">
                  {roleLabel(me?.role)} · {me?.email}
                </div>
                <div className="flex items-center gap-1 wrap mt-1">
                  <Badge tone={me?.isActive ? 'green' : 'slate'}>{me?.isActive ? 'Active account' : 'Inactive'}</Badge>
                  <span className="muted tiny">Member since {dateTimeLabel(me?.createdAt)}</span>
                </div>
              </div>
            </div>

            <form onSubmit={saveProfile}>
              {error ? <Alert tone="danger" title="Could not save your profile">{error}</Alert> : null}
              <div className="form-grid form-grid--2">
                <Field label="Full name" htmlFor="profile-name" required error={fields.fullName}>
                  <input
                    id="profile-name"
                    className="input"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    maxLength={150}
                    required
                  />
                </Field>
                <Field label="Mobile / phone" htmlFor="profile-phone" error={fields.phone} hint="Used for fieldwork coordination.">
                  <input
                    id="profile-phone"
                    className="input"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+63 917 000 0000"
                    maxLength={40}
                  />
                </Field>
              </div>

              {me?.role === 'client' ? (
                <>
                  <SectionTitle title="Address & identification" sub="Used on survey records and plan title blocks." />
                  <Field label="Street address" htmlFor="profile-address" error={fields.addressLine}>
                    <input id="profile-address" className="input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} maxLength={255} />
                  </Field>
                  <div className="form-grid form-grid--2">
                    <Field label="Barangay" htmlFor="profile-barangay" error={fields.barangay}>
                      <input id="profile-barangay" className="input" value={form.barangay} onChange={(e) => setForm({ ...form, barangay: e.target.value })} maxLength={120} />
                    </Field>
                    <Field label="City / municipality" htmlFor="profile-city" error={fields.cityMunicipality}>
                      <input id="profile-city" className="input" value={form.cityMunicipality} onChange={(e) => setForm({ ...form, cityMunicipality: e.target.value })} maxLength={120} />
                    </Field>
                    <Field label="Province" htmlFor="profile-province" error={fields.province}>
                      <input id="profile-province" className="input" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} maxLength={120} />
                    </Field>
                    <Field label="Postal code" htmlFor="profile-postal" error={fields.postalCode}>
                      <input id="profile-postal" className="input" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} maxLength={12} inputMode="numeric" />
                    </Field>
                  </div>
                  <div className="form-grid form-grid--2">
                    <Field label="ID type" htmlFor="profile-id-type" error={fields.validIdType} hint="Required for notarised survey documents.">
                      <select id="profile-id-type" className="select" value={form.validIdType} onChange={(e) => setForm({ ...form, validIdType: e.target.value })}>
                        <option value="">Not provided</option>
                        {["Philippine Passport", "Driver's License", 'UMID', 'PhilSys National ID', "Voter's ID", 'PRC ID', 'Postal ID', 'Company ID'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="ID number" htmlFor="profile-id-no" error={fields.validIdNumber} hint="Only the last four characters are shown to staff where possible.">
                      <input id="profile-id-no" className="input" value={form.validIdNumber} onChange={(e) => setForm({ ...form, validIdNumber: e.target.value })} maxLength={80} />
                    </Field>
                  </div>
                  <div className="form-grid form-grid--2">
                    <Field label="Client type" htmlFor="profile-client-type">
                      <select id="profile-client-type" className="select" value={form.clientType} onChange={(e) => setForm({ ...form, clientType: e.target.value })}>
                        <option value="individual">Individual</option>
                        <option value="company">Company</option>
                        <option value="government">Government agency</option>
                      </select>
                    </Field>
                    <Field label="Company / organisation" htmlFor="profile-company" error={fields.companyName}>
                      <input id="profile-company" className="input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} maxLength={160} />
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <SectionTitle title="Employment record" sub="Contact an administrator to change these details." />
                  <div className="kv-grid">
                    <div className="kv"><span>Employee number</span><b>{profile.employeeNo || '—'}</b></div>
                    <div className="kv"><span>Position</span><b>{profile.position || '—'}</b></div>
                    <div className="kv"><span>PRC / license no.</span><b>{profile.licenseNo || '—'}</b></div>
                    <div className="kv"><span>Specialisation</span><b>{profile.specialization || '—'}</b></div>
                    <div className="kv"><span>Daily project limit</span><b>{profile.maxDailyProjects || '—'}</b></div>
                    <div className="kv"><span>Role</span><b>{roleLabel(me?.role)}</b></div>
                  </div>
                </>
              )}

              <div className="form-actions">
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? <span className="spinner" /> : <Icon name="check" size={15} />} Save profile
                </button>
              </div>
            </form>
          </Card>

          <PasswordCard me={me} onChanged={() => { meState.reload(true); refresh(); }} />

          <Card>
            <SectionTitle title="Privacy & records" sub="Your rights under the Philippine Data Privacy Act (RA 10173)." />
            <p className="small muted">
              The office keeps your contact details, property records and uploaded documents to deliver surveying services and
              comply with professional record-keeping duties. You may request access, correction or a copy of your records by
              contacting the Data Protection Officer.
            </p>
            <div className="btn-row">
              <Link className="btn btn--secondary btn--sm" to="/privacy">
                <Icon name="shield" size={15} /> Read the privacy notice
              </Link>
              <Link className="btn btn--secondary btn--sm" to="/#contact">
                <Icon name="mail" size={15} /> Contact the office
              </Link>
            </div>
          </Card>
        </div>

        <div className="detail-side">
          <Card>
            <SectionTitle title="Signed-in devices" sub="Revoke any session you do not recognise." />
            {sessionsState.loading && !sessionsState.data ? <Loading label="Checking sessions…" /> : null}
            {sessionsState.error ? (
              <Alert tone="danger" title="Could not load sessions">{sessionsState.error.message}</Alert>
            ) : null}
            <div className="stack-sm">
              {(sessionsState.data?.sessions || []).map((session) => (
                <div key={session.id} className="panel" style={{ padding: '.65rem .75rem' }}>
                  <div className="flex items-center justify-between gap-1">
                    <b className="small">{deviceLabel(session.userAgent)}</b>
                    {session.current ? <Badge tone="green">This device</Badge> : null}
                  </div>
                  <div className="tiny muted">
                    IP {session.ip || 'unknown'} · last active {dateTimeLabel(session.lastSeenAt)}
                  </div>
                  {!session.current ? (
                    <button type="button" className="btn btn--danger-soft btn--xs mt-1" onClick={() => revoke(session)}>
                      Sign out device
                    </button>
                  ) : null}
                </div>
              ))}
              {!sessionsState.loading && !(sessionsState.data?.sessions || []).length ? (
                <p className="muted small">No active sessions were found.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <SectionTitle title="Account security" />
            <ul className="mini-list">
              <li>
                <Icon name="lock" size={16} />
                <span className="small">Passwords are stored as one-way bcrypt hashes — nobody at the office can read yours.</span>
              </li>
              <li>
                <Icon name="shield" size={16} />
                <span className="small">Sessions expire automatically after a period of inactivity.</span>
              </li>
              <li>
                <Icon name="activity" size={16} />
                <span className="small">Sensitive actions are recorded in the office audit trail.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function PasswordCard({ me, onChanged }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const result = await api.post('/auth/password', form);
      toast.success(result.message || 'Password updated.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      onChanged();
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle
        title="Change password"
        sub={me?.mustChangePassword ? 'Required before you continue using the portal.' : 'Use at least 10 characters with letters and numbers.'}
      />
      <form onSubmit={submit}>
        {error ? <Alert tone="danger" title="Could not change your password">{error}</Alert> : null}
        <Field label="Current password" htmlFor="pw-current" required error={fields.currentPassword}>
          <input id="pw-current" className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="New password" htmlFor="pw-new" required error={fields.newPassword} hint="At least 10 characters, with a letter and a number.">
            <input id="pw-new" className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} minLength={10} required />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm" required error={fields.confirmPassword}>
            <input id="pw-confirm" className="input" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} minLength={10} required />
          </Field>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--navy" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="key" size={15} />} Update password
          </button>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Changing your password signs out every other device.</p>
      </form>
    </Card>
  );
}
