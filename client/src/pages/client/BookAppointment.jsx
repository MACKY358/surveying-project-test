import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Alert,
  Card,
  Dropzone,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
  SectionTitle,
  StatusBadge,
  useToast,
} from '../../components/ui.jsx';
import { serviceIcon } from '../../components/bits.jsx';
import {
  addDaysISO,
  dateLabel,
  dateLong,
  money,
  timeLabel,
  todayISO,
  weekdayShort,
} from '../../utils.js';

const STEPS = [
  { key: 1, label: 'Service' },
  { key: 2, label: 'Property' },
  { key: 3, label: 'Schedule' },
  { key: 4, label: 'Review' },
];

export default function BookAppointment() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [form, setForm] = useState({
    titleHolder: '',
    lotNo: '',
    blockNo: '',
    barangay: '',
    cityMunicipality: '',
    province: '',
    addressLine: '',
    areaSqm: '',
    titleNo: '',
    taxDeclarationNo: '',
    latitude: '',
    longitude: '',
    propertyNotes: '',
    clientNotes: '',
  });

  const servicesState = useAsync(() => api.get('/public/services'), []);
  const officeState = useAsync(() => api.get('/public/office'), []);

  const services = servicesState.data?.services || [];
  const selectedService = services.find((s) => String(s.id) === String(serviceId));
  const office = officeState.data?.office;
  const hours = officeState.data?.businessHours || [];

  const from = addDaysISO(todayISO(), 1);
  const to = addDaysISO(todayISO(), 31);

  const rangeState = useAsync(
    () =>
      serviceId
        ? api.get('/public/availability', { serviceId, from, to })
        : Promise.resolve({ days: [] }),
    [serviceId],
  );

  const days = rangeState.data?.days || [];

  const slotState = useAsync(
    () =>
      serviceId && date
        ? api.get('/public/availability', { serviceId, date })
        : Promise.resolve(null),
    [serviceId, date],
  );

  useEffect(() => {
    if (!days.length || date) return;
    const first = days.find((d) => !d.closed && d.availableCount > 0);
    if (first) setDate(first.date);
  }, [days, date]);

  useEffect(() => {
    setTime('');
  }, [date]);

  const daySlots = slotState.data?.slots || [];
  const availableCount = useMemo(() => daySlots.filter((s) => s.available).length, [daySlots]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    if (fields[field]) setFields((current) => ({ ...current, [field]: undefined }));
  }

  function goNext() {
    setError('');
    if (step === 1 && !selectedService) {
      setError('Choose the surveying service you need.');
      return;
    }
    if (step === 3 && (!date || !time)) {
      setError('Choose an available date and time for the field visit.');
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  function goBack() {
    setError('');
    setStep((current) => Math.max(1, current - 1));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFields({});
    if (!serviceId || !date || !time) {
      setError('Choose a service, date and time before submitting.');
      setStep(3);
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.append('serviceId', String(serviceId));
      data.append('preferredDate', date);
      data.append('preferredTime', time);
      const textFields = [
        'titleHolder',
        'lotNo',
        'blockNo',
        'barangay',
        'cityMunicipality',
        'province',
        'addressLine',
        'areaSqm',
        'titleNo',
        'taxDeclarationNo',
        'latitude',
        'longitude',
        'propertyNotes',
        'clientNotes',
      ];
      textFields.forEach((key) => {
        const value = String(form[key] || '').trim();
        if (value) data.append(key, value);
      });
      files.forEach((file) => data.append('documents', file));
      const result = await api.upload('/appointments', data);
      toast.success(result.message || 'Booking request submitted.');
      navigate(`/app/appointments/${result.appointment.id}`);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      if (err.status === 409) setStep(3);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Book a survey"
        subtitle="Tell us about the property and choose a preferred field visit. The office reviews every request before confirming."
        back={{ label: 'Back to dashboard', onClick: () => navigate('/app') }}
        actions={
          <Link className="btn btn--secondary" to="/app/appointments">
            <Icon name="calendar" size={16} /> My appointments
          </Link>
        }
      />

      <div className="stepper" aria-label="Booking steps">
        {STEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`stepper__item ${step === s.key ? 'active' : ''} ${step > s.key ? 'done' : ''}`}
            onClick={() => {
              if (s.key < step) setStep(s.key);
            }}
            disabled={s.key > step}
            aria-current={step === s.key ? 'step' : undefined}
          >
            <span className="stepper__num">{step > s.key ? <Icon name="check" size={13} /> : s.key}</span>
            {s.label}
          </button>
        ))}
      </div>

      {error ? <Alert tone="danger" title="Please check the details">{error}</Alert> : null}

      <div className="split split--wide-left">
        <div className="stack">
          {step === 1 ? (
            <Card>
              <SectionTitle title="What do you need surveyed?" sub="Fees shown are the office base rate. The final quote depends on the property." />
              {servicesState.loading && !servicesState.data ? <Loading label="Loading services…" /> : null}
              {servicesState.error ? <ErrorState error={servicesState.error} onRetry={() => servicesState.reload()} /> : null}
              <div className="stack-sm">
                {services.map((service) => (
                  <button
                    type="button"
                    key={service.id}
                    className={`service-pick ${String(serviceId) === String(service.id) ? 'active' : ''}`}
                    onClick={() => {
                      setServiceId(String(service.id));
                      setDate('');
                      setTime('');
                    }}
                    aria-pressed={String(serviceId) === String(service.id)}
                  >
                    <Icon name={serviceIcon(service)} size={20} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{service.name}</b>
                      <span>{service.description || service.category}</span>
                      <span className="flex wrap gap-1" style={{ marginTop: '.3rem' }}>
                        <span className="badge badge--slate">{money(service.baseFee)} base</span>
                        <span className="badge badge--slate">{service.durationMinutes} min visit</span>
                        {service.requiresFieldwork ? <span className="badge badge--teal">Fieldwork</span> : null}
                        {service.turnaroundDays ? <span className="badge badge--slate">~{service.turnaroundDays} days</span> : null}
                      </span>
                    </span>
                    {String(serviceId) === String(service.id) ? <Icon name="check" size={18} /> : null}
                  </button>
                ))}
              </div>
              {!servicesState.loading && !services.length ? (
                <Empty icon="compass" title="No services available" message="Please contact the office directly — the online catalogue is being updated." />
              ) : null}
              <div className="form-actions">
                <span />
                <button type="button" className="btn" onClick={goNext} disabled={!selectedService}>
                  Continue <Icon name="arrowRight" size={16} />
                </button>
              </div>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card>
              <SectionTitle title="Property details" sub="These details appear on the survey records and plan title block. All fields are optional at booking; the office may ask for more later." />
              <form onSubmit={(e) => { e.preventDefault(); goNext(); }}>
                <div className="form-grid form-grid--2">
                  <Field label="Registered owner / title holder" htmlFor="book-owner" error={fields.titleHolder}>
                    <input id="book-owner" className="input" value={form.titleHolder} onChange={(e) => update('titleHolder', e.target.value)} maxLength={180} placeholder="Name on the title or tax declaration" />
                  </Field>
                  <Field label="Lot number" htmlFor="book-lot" error={fields.lotNo}>
                    <input id="book-lot" className="input" value={form.lotNo} onChange={(e) => update('lotNo', e.target.value)} maxLength={60} placeholder="e.g. Lot 12" />
                  </Field>
                  <Field label="Block number" htmlFor="book-block" error={fields.blockNo}>
                    <input id="book-block" className="input" value={form.blockNo} onChange={(e) => update('blockNo', e.target.value)} maxLength={60} />
                  </Field>
                  <Field label="Barangay" htmlFor="book-barangay" error={fields.barangay}>
                    <input id="book-barangay" className="input" value={form.barangay} onChange={(e) => update('barangay', e.target.value)} maxLength={120} placeholder="e.g. Poblacion" />
                  </Field>
                  <Field label="City / municipality" htmlFor="book-city" error={fields.cityMunicipality}>
                    <input id="book-city" className="input" value={form.cityMunicipality} onChange={(e) => update('cityMunicipality', e.target.value)} maxLength={120} />
                  </Field>
                  <Field label="Province" htmlFor="book-province" error={fields.province}>
                    <input id="book-province" className="input" value={form.province} onChange={(e) => update('province', e.target.value)} maxLength={120} />
                  </Field>
                </div>
                <Field label="Street address / landmark" htmlFor="book-address" error={fields.addressLine} hint="Include the nearest landmark to help the field team.">
                  <input id="book-address" className="input" value={form.addressLine} onChange={(e) => update('addressLine', e.target.value)} maxLength={255} />
                </Field>
                <div className="form-grid form-grid--3">
                  <Field label="Area (square metres)" htmlFor="book-area" error={fields.areaSqm}>
                    <input id="book-area" className="input" inputMode="decimal" value={form.areaSqm} onChange={(e) => update('areaSqm', e.target.value)} placeholder="e.g. 245.60" />
                  </Field>
                  <Field label="TCT / OCT number" htmlFor="book-title" error={fields.titleNo}>
                    <input id="book-title" className="input" value={form.titleNo} onChange={(e) => update('titleNo', e.target.value)} maxLength={80} />
                  </Field>
                  <Field label="Tax declaration no." htmlFor="book-tax" error={fields.taxDeclarationNo}>
                    <input id="book-tax" className="input" value={form.taxDeclarationNo} onChange={(e) => update('taxDeclarationNo', e.target.value)} maxLength={80} />
                  </Field>
                  <Field label="Latitude" htmlFor="book-lat" error={fields.latitude} hint="Optional">
                    <input id="book-lat" className="input" value={form.latitude} onChange={(e) => update('latitude', e.target.value)} placeholder="15.0286" />
                  </Field>
                  <Field label="Longitude" htmlFor="book-lng" error={fields.longitude} hint="Optional">
                    <input id="book-lng" className="input" value={form.longitude} onChange={(e) => update('longitude', e.target.value)} placeholder="120.6898" />
                  </Field>
                </div>
                <Field label="Property notes" htmlFor="book-property-notes" error={fields.propertyNotes}>
                  <textarea id="book-property-notes" className="textarea" rows={3} value={form.propertyNotes} onChange={(e) => update('propertyNotes', e.target.value)} maxLength={1000} placeholder="Access notes, disputed boundaries, existing monuments, etc." />
                </Field>
                <div className="form-actions">
                  <button type="button" className="btn btn--secondary" onClick={goBack}><Icon name="arrowLeft" size={16} /> Back</button>
                  <button type="submit" className="btn">Continue <Icon name="arrowRight" size={16} /></button>
                </div>
              </form>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card>
              <SectionTitle
                title="Choose a date and time"
                sub={`Field visits run ${hours.length ? 'during office hours' : 'on office hours'}. Times marked unavailable are already booked or fall in the office break.`}
              />
              {rangeState.loading && !rangeState.data ? <Loading label="Checking available dates…" /> : null}
              {rangeState.error ? <ErrorState error={rangeState.error} onRetry={() => rangeState.reload()} /> : null}
              {days.length ? (
                <>
                  <div className="day-strip" role="list" aria-label="Available dates">
                    {days.map((day) => (
                      <button
                        key={day.date}
                        type="button"
                        role="listitem"
                        className={`day-chip ${date === day.date ? 'active' : ''}`}
                        disabled={day.closed || day.availableCount === 0}
                        onClick={() => setDate(day.date)}
                        title={day.closed ? 'Office closed' : day.availableCount ? `${day.availableCount} slots open` : 'Fully booked'}
                      >
                        <span>{weekdayShort(day.date)}</span>
                        <b>{Number(day.date.slice(8, 10))}</b>
                        <small>{day.closed ? 'Closed' : day.availableCount ? `${day.availableCount} open` : 'Full'}</small>
                      </button>
                    ))}
                  </div>
                  <p className="tiny muted">
                    Showing dates up to {dateLabel(to)}. The office reviews every request; a preferred time is not a final confirmation.
                  </p>

                  {date ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between gap-1 wrap mb-1">
                        <b className="small">{dateLong(date)}</b>
                        <span className="badge badge--slate">{availableCount} slot{availableCount === 1 ? '' : 's'} available</span>
                      </div>
                      {slotState.loading ? <Loading label="Checking times…" /> : null}
                      {slotState.data?.closed ? <Alert tone="warn">{slotState.data.reason || 'The office is closed on this date.'}</Alert> : null}
                      {slotState.error ? <ErrorState error={slotState.error} onRetry={() => slotState.reload()} /> : null}
                      {!slotState.loading && !slotState.data?.closed ? (
                        <div className="slot-grid" role="group" aria-label="Available times">
                          {daySlots.map((slot) => (
                            <button
                              key={slot.time}
                              type="button"
                              className={`slot ${time === slot.time ? 'active' : ''}`}
                              disabled={!slot.available}
                              title={slot.reason || 'Available'}
                              onClick={() => setTime(slot.time)}
                            >
                              {timeLabel(slot.time)}
                              <span className="tiny" style={{ display: 'block', opacity: 0.72 }}>{slot.available ? 'Available' : slot.reason}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="muted small">Select a date above to see the available times.</p>
                  )}
                </>
              ) : null}
              <div className="form-actions">
                <button type="button" className="btn btn--secondary" onClick={goBack}><Icon name="arrowLeft" size={16} /> Back</button>
                <button type="button" className="btn" onClick={goNext} disabled={!date || !time}>Continue <Icon name="arrowRight" size={16} /></button>
              </div>
            </Card>
          ) : null}

          {step === 4 ? (
            <Card>
              <SectionTitle title="Review your request" sub="Check the details, add any notes or attachments, then submit." />
              <form onSubmit={submit}>
                <div className="kv-grid mb-2">
                  <div className="kv"><span>Service</span><b>{selectedService?.name || '—'}</b></div>
                  <div className="kv"><span>Preferred date</span><b>{dateLabel(date)}</b></div>
                  <div className="kv"><span>Preferred time</span><b>{timeLabel(time)}</b></div>
                  <div className="kv"><span>Estimated base fee</span><b>{money(selectedService?.baseFee)}</b></div>
                  <div className="kv"><span>Lot / block</span><b>{[form.lotNo, form.blockNo].filter(Boolean).join(' / ') || '—'}</b></div>
                  <div className="kv"><span>Location</span><b>{[form.barangay, form.cityMunicipality, form.province].filter(Boolean).join(', ') || '—'}</b></div>
                </div>
                <Field label="Notes for the field team" htmlFor="book-notes" error={fields.clientNotes} hint="Gate codes, access restrictions, preferred contact person, etc.">
                  <textarea id="book-notes" className="textarea" rows={3} value={form.clientNotes} onChange={(e) => update('clientNotes', e.target.value)} maxLength={2000} />
                </Field>
                <Field label="Supporting documents" hint="Optional. Up to 6 files — title, tax declaration, sketch plan. You can upload more later." error={fields.documents}>
                  <Dropzone files={files} onFiles={setFiles} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt" maxMb={20} label="Attach title or property documents" />
                </Field>
                <Alert tone="info" title="What happens next">
                  The office reviews your property details and assigns a licensed surveyor. You will receive a notification when the
                  appointment is approved and confirmed. Email and SMS delivery are not configured; check this portal for updates.
                </Alert>
                <p className="tiny muted">
                  By submitting, you confirm the information is accurate and consent to the office processing it for this survey, in
                  line with our <Link to="/privacy">privacy notice</Link>.
                </p>
                <div className="form-actions">
                  <button type="button" className="btn btn--secondary" onClick={goBack} disabled={busy}><Icon name="arrowLeft" size={16} /> Back</button>
                  <button type="submit" className="btn" disabled={busy}>
                    {busy ? <span className="spinner" /> : <Icon name="check" size={16} />} Submit booking request
                  </button>
                </div>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="detail-side">
          <Card>
            <SectionTitle title="Booking summary" />
            {selectedService ? (
              <>
                <div className="flex items-center gap-1 mb-1">
                  <span className="service-card__icon" style={{ width: 38, height: 38, margin: 0 }}>
                    <Icon name={serviceIcon(selectedService)} size={19} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b className="small">{selectedService.name}</b>
                    <div className="tiny muted">{selectedService.durationMinutes} minute visit</div>
                  </div>
                </div>
                <div className="kv-grid">
                  <div className="kv"><span>Date</span><b>{date ? dateLabel(date) : 'Not chosen'}</b></div>
                  <div className="kv"><span>Time</span><b>{time ? timeLabel(time) : 'Not chosen'}</b></div>
                  <div className="kv"><span>Base fee</span><b>{money(selectedService.baseFee)}</b></div>
                  <div className="kv"><span>Turnaround</span><b>{selectedService.turnaroundDays ? `~${selectedService.turnaroundDays} days` : 'To be advised'}</b></div>
                </div>
              </>
            ) : (
              <p className="muted small">Choose a service to see the summary.</p>
            )}
          </Card>

          <Card>
            <SectionTitle title="Office hours" sub="Philippine Standard Time" />
            <div className="mini-list">
              {hours.map((h) => (
                <li key={h.weekday} className="flex items-center justify-between">
                  <span className="small">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][h.weekday]}</span>
                  <span className="tiny muted">
                    {h.isClosed ? 'Closed' : `${timeLabel(h.openTime)} – ${timeLabel(h.closeTime)}`}
                  </span>
                </li>
              ))}
            </div>
            {office?.phone || office?.mobile ? (
              <p className="tiny muted" style={{ marginBottom: 0 }}>
                Need help? Call {office.mobile || office.phone}.
              </p>
            ) : null}
          </Card>

          <Card>
            <SectionTitle title="Requirements" />
            <div className="mini-list">
              <li><Icon name="file" size={15} /><span className="small">Title or tax declaration (if available)</span></li>
              <li><Icon name="file" size={15} /><span className="small">Sketch or vicinity map</span></li>
              <li><Icon name="file" size={15} /><span className="small">Valid ID for the property owner</span></li>
            </div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>You can upload these now or add them later from the document library.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
