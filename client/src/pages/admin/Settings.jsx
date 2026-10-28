import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Alert,
  Badge,
  Card,
  ErrorState,
  Field,
  Loading,
  PageHead,
  SectionTitle,
  Tabs,
  useToast,
} from '../../components/ui.jsx';
import { WEEKDAYS_LONG } from '../../utils.js';

const TABS = [
  { key: 'office', label: 'Office profile', icon: 'home' },
  { key: 'booking', label: 'Booking & privacy', icon: 'calendar' },
  { key: 'hours', label: 'Business hours', icon: 'clock' },
  { key: 'announcement', label: 'Announcement', icon: 'bell' },
];

const EMPTY_ANNOUNCEMENT = { title: '', message: '', audience: 'all', link: '' };

function hhmm(value) {
  return value ? String(value).slice(0, 5) : '';
}

export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState('office');
  const [form, setForm] = useState({});
  const [hours, setHours] = useState([]);
  const [announcement, setAnnouncement] = useState(EMPTY_ANNOUNCEMENT);
  const [saving, setSaving] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [sending, setSending] = useState(false);

  const { data, loading, error, reload } = useAsync(() => api.get('/admin/settings'), []);

  useEffect(() => {
    if (!data?.settings) return;
    setForm(data.settings);
    setHours(
      (data.businessHours || []).map((row) => ({
        ...row,
        openTime: hhmm(row.openTime) || '08:00',
        closeTime: hhmm(row.closeTime) || '17:00',
        breakStart: hhmm(row.breakStart),
        breakEnd: hhmm(row.breakEnd),
        slotMinutes: row.slotMinutes || 60,
      })),
    );
  }, [data]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form)
          .filter(([key]) => key !== 'email_notifications_enabled')
          .map(([key, value]) => [key, value === undefined || value === null ? null : String(value)]),
      );
      const result = await api.patch('/admin/settings', payload);
      setForm(result.settings);
      toast.success(result.message || 'Office settings saved.');
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveHours(event) {
    event.preventDefault();
    if (!hours.length) return;
    const invalid = hours.find((row) => !row.isClosed && row.openTime >= row.closeTime);
    if (invalid) {
      toast.error(`${WEEKDAYS_LONG[invalid.weekday]}: closing time must be after opening time.`);
      return;
    }
    setSavingHours(true);
    try {
      const payload = hours.map((row) => ({
        weekday: row.weekday,
        openTime: row.openTime,
        closeTime: row.closeTime,
        breakStart: row.breakStart || null,
        breakEnd: row.breakEnd || null,
        isClosed: !!row.isClosed,
        slotMinutes: Number(row.slotMinutes) || 60,
      }));
      const result = await api.put('/admin/business-hours', payload);
      toast.success(result.message || 'Business hours saved.');
      await reload(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingHours(false);
    }
  }

  async function sendAnnouncement(event) {
    event.preventDefault();
    setSending(true);
    try {
      const result = await api.post('/admin/announcements', announcement);
      toast.success(result.message || 'Announcement sent.');
      setAnnouncement(EMPTY_ANNOUNCEMENT);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  function updateHour(index, key, value) {
    setHours((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  if (loading && !data) return <Loading label="Loading office settings…" />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;

  return (
    <>
      <PageHead
        title="Office settings"
        subtitle="Public contact details, booking rules, opening hours and client announcements."
        actions={
          <button type="button" className="btn btn--secondary" onClick={() => reload()} disabled={loading}>
            <Icon name="refresh" size={16} /> Refresh
          </button>
        }
      />

      <Card flush className="mb-2">
        <div style={{ padding: '.6rem .9rem 0' }}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </div>
      </Card>

      {tab === 'office' ? (
        <form onSubmit={saveSettings}>
          <div className="split split--wide-left">
            <div className="stack">
              <Card>
                <SectionTitle title="Practice details" sub="Shown on the public website, receipts and documents." />
                <div className="form-grid form-grid--2">
                  <Field label="Company name" htmlFor="setting-company">
                    <input id="setting-company" className="input" value={form.company_name || ''} onChange={set('company_name')} maxLength={150} />
                  </Field>
                  <Field label="Tagline" htmlFor="setting-tagline">
                    <input id="setting-tagline" className="input" value={form.tagline || ''} onChange={set('tagline')} maxLength={200} />
                  </Field>
                </div>
                <Field label="About the practice" htmlFor="setting-about" hint="A short paragraph used on the public website.">
                  <textarea id="setting-about" className="textarea" rows={4} value={form.about || ''} onChange={set('about')} maxLength={2000} />
                </Field>
                <div className="form-grid form-grid--2">
                  <Field label="Office address" htmlFor="setting-address" className="w-full">
                    <input id="setting-address" className="input" value={form.address || ''} onChange={set('address')} maxLength={255} />
                  </Field>
                  <Field label="City / municipality" htmlFor="setting-city">
                    <input id="setting-city" className="input" value={form.city || ''} onChange={set('city')} maxLength={120} />
                  </Field>
                  <Field label="Province" htmlFor="setting-province">
                    <input id="setting-province" className="input" value={form.province || ''} onChange={set('province')} maxLength={120} />
                  </Field>
                  <Field label="Postal code" htmlFor="setting-postal">
                    <input id="setting-postal" className="input" value={form.postal_code || ''} onChange={set('postal_code')} maxLength={12} />
                  </Field>
                </div>
              </Card>

              <Card>
                <SectionTitle title="Contact channels" />
                <div className="form-grid form-grid--2">
                  <Field label="Landline" htmlFor="setting-phone">
                    <input id="setting-phone" className="input" value={form.phone || ''} onChange={set('phone')} maxLength={30} />
                  </Field>
                  <Field label="Mobile" htmlFor="setting-mobile">
                    <input id="setting-mobile" className="input" value={form.mobile || ''} onChange={set('mobile')} maxLength={30} />
                  </Field>
                  <Field label="Office email" htmlFor="setting-email">
                    <input id="setting-email" className="input" type="email" value={form.email || ''} onChange={set('email')} maxLength={190} />
                  </Field>
                  <Field label="Facebook page" htmlFor="setting-facebook">
                    <input id="setting-facebook" className="input" type="url" value={form.facebook || ''} onChange={set('facebook')} maxLength={255} />
                  </Field>
                </div>
              </Card>

              <Card>
                <SectionTitle title="Map location" sub="Used by the “Get directions” link on the public website." />
                <div className="form-grid form-grid--2">
                  <Field label="Latitude" htmlFor="setting-lat">
                    <input id="setting-lat" className="input" value={form.map_lat || ''} onChange={set('map_lat')} maxLength={20} />
                  </Field>
                  <Field label="Longitude" htmlFor="setting-lng">
                    <input id="setting-lng" className="input" value={form.map_lng || ''} onChange={set('map_lng')} maxLength={20} />
                  </Field>
                </div>
              </Card>
            </div>

            <div className="detail-side">
              <Card>
                <SectionTitle title="Accreditation" />
                <Field label="PRC license number" htmlFor="setting-prc">
                  <input id="setting-prc" className="input" value={form.prc_license || ''} onChange={set('prc_license')} maxLength={60} />
                </Field>
                <Field label="TIN" htmlFor="setting-tin">
                  <input id="setting-tin" className="input" value={form.tin || ''} onChange={set('tin')} maxLength={40} />
                </Field>
              </Card>

              <Card>
                <SectionTitle title="Data protection officer" />
                <Field label="Name" htmlFor="setting-dpo">
                  <input id="setting-dpo" className="input" value={form.privacy_officer || ''} onChange={set('privacy_officer')} maxLength={150} />
                </Field>
                <Field label="Privacy email" htmlFor="setting-privacy-email">
                  <input id="setting-privacy-email" className="input" type="email" value={form.privacy_email || ''} onChange={set('privacy_email')} maxLength={190} />
                </Field>
                <p className="tiny muted" style={{ margin: 0 }}>
                  These details appear in the public privacy notice and on data subject request instructions.
                </p>
              </Card>

              <div className="form-actions">
                <button type="submit" className="btn btn--block" disabled={saving}>
                  {saving ? 'Saving…' : 'Save office profile'}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      {tab === 'booking' ? (
        <form onSubmit={saveSettings}>
          <div className="split split--wide-left">
            <div className="stack">
              <Card>
                <SectionTitle title="Booking rules" sub="Applied to new requests on the public website and client portal." />
                <div className="form-grid form-grid--2">
                  <Field label="Minimum notice (days)" htmlFor="setting-lead" hint="Clients cannot book sooner than this.">
                    <input id="setting-lead" className="input" type="number" min={0} max={60} value={form.booking_lead_days || ''} onChange={set('booking_lead_days')} />
                  </Field>
                  <Field label="Maximum advance booking (days)" htmlFor="setting-advance" hint="How far ahead the calendar opens.">
                    <input id="setting-advance" className="input" type="number" min={7} max={365} value={form.max_advance_days || ''} onChange={set('max_advance_days')} />
                  </Field>
                </div>
                <Field
                  label="Client notice"
                  htmlFor="setting-session-notice"
                  hint="Displayed in the client portal near account and session information."
                >
                  <textarea
                    id="setting-session-notice"
                    className="textarea"
                    rows={3}
                    value={form.session_notice || ''}
                    onChange={set('session_notice')}
                    maxLength={500}
                  />
                </Field>
              </Card>

              <Card>
                <SectionTitle title="Records retention" sub="Philippine Data Privacy Act alignment." />
                <Field
                  label="Document retention period (years)"
                  htmlFor="setting-retention"
                  hint="The office keeps project documents and plans for this period unless a longer legal requirement applies."
                >
                  <input
                    id="setting-retention"
                    className="input"
                    type="number"
                    min={1}
                    max={50}
                    value={form.document_retention_years || ''}
                    onChange={set('document_retention_years')}
                  />
                </Field>
                <Alert tone="warn" title="Retention is a policy commitment">
                  Changing this number updates the published policy. It does not automatically delete records. Schedule a
                  documented disposal review before removing any project archive.
                </Alert>
              </Card>

              <div className="form-actions">
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Save booking & privacy rules'}
                </button>
              </div>
            </div>

            <div className="detail-side">
              <Card>
                <SectionTitle title="Notification channels" />
                <div className="toggle-row">
                  <div>
                    <b className="small">In-app notifications</b>
                    <div className="tiny muted">Booking updates, document decisions and messages appear in the portal.</div>
                  </div>
                  <Badge tone="green">Active</Badge>
                </div>
                <div className="toggle-row">
                  <div>
                    <b className="small">Email delivery</b>
                    <div className="tiny muted">No SMTP provider is configured on this installation.</div>
                  </div>
                  <Badge tone="slate">Off</Badge>
                </div>
                <div className="toggle-row">
                  <div>
                    <b className="small">SMS delivery</b>
                    <div className="tiny muted">No SMS gateway is configured on this installation.</div>
                  </div>
                  <Badge tone="slate">Off</Badge>
                </div>
                <Alert tone="info">
                  The system never claims an email or text was delivered. Staff must call or message clients through their
                  usual channels for time-sensitive changes.
                </Alert>
              </Card>

              <Card>
                <SectionTitle title="Session security" />
                <p className="tiny muted" style={{ margin: 0 }}>
                  Sessions are stored server-side and expire automatically. Repeated failed sign-ins are throttled. Only
                  authorised staff can view client records, and every administrative action is logged.
                </p>
              </Card>
            </div>
          </div>
        </form>
      ) : null}

      {tab === 'hours' ? (
        <form onSubmit={saveHours}>
          <Card className="mb-2">
            <SectionTitle
              title="Opening hours & booking slots"
              sub="These hours control the times clients can choose when booking a field visit."
            />
            <div className="stack-sm">
              {hours.map((row, index) => (
                <div key={row.weekday} className="panel" style={{ padding: '.7rem' }}>
                  <div className="flex items-center justify-between gap-1 wrap mb-1">
                    <b className="small">{WEEKDAYS_LONG[row.weekday]}</b>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={!!row.isClosed}
                        onChange={(event) => updateHour(index, 'isClosed', event.target.checked)}
                      />
                      Closed all day
                    </label>
                  </div>
                  <div className="form-grid form-grid--2">
                    <Field label="Opens" htmlFor={`open-${row.weekday}`}>
                      <input
                        id={`open-${row.weekday}`}
                        className="input"
                        type="time"
                        value={row.openTime}
                        onChange={(event) => updateHour(index, 'openTime', event.target.value)}
                        disabled={!!row.isClosed}
                      />
                    </Field>
                    <Field label="Closes" htmlFor={`close-${row.weekday}`}>
                      <input
                        id={`close-${row.weekday}`}
                        className="input"
                        type="time"
                        value={row.closeTime}
                        onChange={(event) => updateHour(index, 'closeTime', event.target.value)}
                        disabled={!!row.isClosed}
                      />
                    </Field>
                    <Field label="Break starts" htmlFor={`break-start-${row.weekday}`} hint="Optional midday break.">
                      <input
                        id={`break-start-${row.weekday}`}
                        className="input"
                        type="time"
                        value={row.breakStart || ''}
                        onChange={(event) => updateHour(index, 'breakStart', event.target.value)}
                        disabled={!!row.isClosed}
                      />
                    </Field>
                    <Field label="Break ends" htmlFor={`break-end-${row.weekday}`}>
                      <input
                        id={`break-end-${row.weekday}`}
                        className="input"
                        type="time"
                        value={row.breakEnd || ''}
                        onChange={(event) => updateHour(index, 'breakEnd', event.target.value)}
                        disabled={!!row.isClosed}
                      />
                    </Field>
                    <Field label="Slot length (minutes)" htmlFor={`slot-${row.weekday}`} hint="15–240 minutes.">
                      <input
                        id={`slot-${row.weekday}`}
                        className="input"
                        type="number"
                        min={15}
                        max={240}
                        step={15}
                        value={row.slotMinutes}
                        onChange={(event) => updateHour(index, 'slotMinutes', event.target.value)}
                        disabled={!!row.isClosed}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={savingHours}>
              {savingHours ? 'Saving…' : 'Save business hours'}
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'announcement' ? (
        <div className="split split--wide-left">
          <Card>
            <SectionTitle title="Send an in-app announcement" sub="Delivered as a notification inside each recipient's portal." />
            <form onSubmit={sendAnnouncement}>
              <Field label="Title" htmlFor="announcement-title" required>
                <input
                  id="announcement-title"
                  className="input"
                  value={announcement.title}
                  onChange={(event) => setAnnouncement((current) => ({ ...current, title: event.target.value }))}
                  maxLength={180}
                  required
                />
              </Field>
              <Field label="Message" htmlFor="announcement-message" required hint="Up to 500 characters.">
                <textarea
                  id="announcement-message"
                  className="textarea"
                  rows={4}
                  value={announcement.message}
                  onChange={(event) => setAnnouncement((current) => ({ ...current, message: event.target.value }))}
                  maxLength={500}
                  required
                />
              </Field>
              <div className="form-grid form-grid--2">
                <Field label="Audience" htmlFor="announcement-audience" required>
                  <select
                    id="announcement-audience"
                    className="select"
                    value={announcement.audience}
                    onChange={(event) => setAnnouncement((current) => ({ ...current, audience: event.target.value }))}
                  >
                    <option value="all">Everyone</option>
                    <option value="clients">Clients only</option>
                    <option value="staff">Staff only</option>
                  </select>
                </Field>
                <Field label="Link (optional)" htmlFor="announcement-link" hint="For example /app/appointments">
                  <input
                    id="announcement-link"
                    className="input"
                    value={announcement.link}
                    onChange={(event) => setAnnouncement((current) => ({ ...current, link: event.target.value }))}
                    maxLength={255}
                    placeholder="/app/appointments"
                  />
                </Field>
              </div>
              <Alert tone="warn" title="This sends an in-app notification only">
                No email or SMS is sent because no provider is configured. Recipients see the announcement the next time they
                open their notification list.
              </Alert>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={sending}>
                  <Icon name="send" size={16} /> {sending ? 'Sending…' : 'Send announcement'}
                </button>
              </div>
            </form>
          </Card>

          <div className="detail-side">
            <Card>
              <SectionTitle title="How announcements work" />
              <ul className="mini-list">
                <li>
                  <Icon name="bell" size={16} />
                  <div>
                    <div className="small strong">Notification centre</div>
                    <div className="tiny muted">Recipients see a bell badge until they open the announcement.</div>
                  </div>
                </li>
                <li>
                  <Icon name="users" size={16} />
                  <div>
                    <div className="small strong">Audience targeting</div>
                    <div className="tiny muted">Clients and staff can receive separate messages.</div>
                  </div>
                </li>
                <li>
                  <Icon name="shield" size={16} />
                  <div>
                    <div className="small strong">Audited</div>
                    <div className="tiny muted">Sending an announcement is written to the activity log.</div>
                  </div>
                </li>
              </ul>
            </Card>
            <Card>
              <SectionTitle title="Need to reach someone directly?" />
              <p className="tiny muted" style={{ marginBottom: '.6rem' }}>
                Use the phone or in-app messages for urgent schedule changes. The messaging module creates an in-app thread
                that staff can answer from the portal.
              </p>
              <a className="btn btn--secondary btn--block btn--sm" href="/admin/messages">
                <Icon name="message" size={15} /> Open messages
              </a>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
