import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync, usePageTitle } from '../../hooks.js';
import { useAuth } from '../../auth.jsx';
import { useToast, Alert, ErrorState, Loading } from '../../components/ui.jsx';
import { Icon, LogoMark } from '../../components/Icons.jsx';
import { timeLabel, money, todayISO, homeFor, dateLong, plural } from '../../utils.js';

const FALLBACK = {
  companyName: 'Trompeta Surveying',
  tagline: 'Licensed land surveying and geodetic engineering',
  about:
    'A family-run geodetic engineering practice serving landowners, developers and local government units across Luzon since 2009. We handle relocation surveys, subdivision plans, boundary verification and land title documentation support.',
  address: 'Unit 4B, Rizal Commercial Center, 128 Mabini Street, Barangay Poblacion, San Fernando, Pampanga',
  city: 'San Fernando',
  province: 'Pampanga',
  phone: '(045) 861-4420',
  mobile: '+63 917 555 0142',
  email: 'office@trompetasurveying.ph',
  privacyOfficer: 'Atty. Maria Lourdes Santos',
  privacyEmail: 'privacy@trompetasurveying.ph',
  prcLicense: 'PRC GE-0028471',
  facebook: 'https://facebook.com/trompetasurveying',
  mapLat: '15.0286',
  mapLng: '120.6898',
  retentionYears: 10,
  emailNotificationsEnabled: false,
};

const PROCESS = [
  { title: 'Tell us about your land', body: 'Create an account and book a survey slot. Upload your title, tax declaration or sketch so the team can prepare.' },
  { title: 'Office review & confirmation', body: 'The office checks the schedule, assigns a licensed surveyor and confirms the field visit. Conflicts are caught before anyone travels.' },
  { title: 'Fieldwork & data processing', body: 'Follow each stage online. Field notes, measurements and drawing revisions are recorded against your project.' },
  { title: 'Plan release & records', body: 'When the plan passes professional review, approved drawings are released to your account with a complete document history.' },
];

function serviceIcon(service) {
  const text = `${service.code || ''} ${service.name || ''}`.toLowerCase();
  if (text.includes('topo')) return 'map';
  if (text.includes('subdiv') || text.includes('consolid')) return 'layers';
  if (text.includes('boundary') || text.includes('relocat')) return 'ruler';
  if (text.includes('title') || text.includes('document')) return 'file';
  if (text.includes('consult')) return 'compass';
  return 'clipboard';
}

function hoursLabel(hours) {
  if (!hours) return '—';
  if (hours.isClosed) return 'Closed';
  return `${timeLabel(hours.openTime)} – ${timeLabel(hours.closeTime)}`;
}

export default function Landing() {
  usePageTitle('Licensed Land Surveying');
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    privacyAccepted: false,
    website: '',
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data, error, loading, reload } = useAsync(
    () =>
      Promise.all([api.get('/public/office'), api.get('/public/services')]).then(([officeData, serviceData]) => ({
        office: officeData.office,
        hours: officeData.businessHours,
        services: serviceData.services,
      })),
    [],
  );

  const office = data?.office || FALLBACK;
  const hours = data?.hours || [];
  const services = data?.services || [];
  const today = todayISO();
  const todayHours = hours.find((h) => h.weekday === new Date(`${today}T00:00:00`).getDay());
  const nowMinutes = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }, []);
  const isOpenNow = todayHours && !todayHours.isClosed
    ? nowMinutes >= Number(todayHours.openTime.slice(0, 2)) * 60 + Number(todayHours.openTime.slice(3, 5))
      && nowMinutes < Number(todayHours.closeTime.slice(0, 2)) * 60 + Number(todayHours.closeTime.slice(3, 5))
    : false;

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function submitInquiry(event) {
    event.preventDefault();
    setSending(true);
    setErrors({});
    try {
      const result = await api.post('/public/inquiries', form);
      setSent(true);
      setForm({ name: '', email: '', phone: '', subject: '', message: '', privacyAccepted: false, website: '' });
      toast.success(result.message || 'Your inquiry has been received.', 'Message sent');
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${office.mapLat},${office.mapLng}`)}`;

  return (
    <div className="landing">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="logo" aria-label="Trompeta Surveying home">
            <LogoMark size={40} />
            <span className="logo__text">
              <b>Trompeta Surveying</b>
              <span>Land surveying</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Main">
            <a href="#services">Services</a>
            <a href="#process">How it works</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
            <Link to="/privacy">Privacy</Link>
          </nav>
          {user ? (
            <Link to={homeFor(user.role)} className="btn btn--sm">
              Open my portal <Icon name="arrowRight" size={15} />
            </Link>
          ) : (
            <div className="btn-row" style={{ marginLeft: 'auto' }}>
              <Link to="/login" className="btn btn--secondary btn--sm">
                Sign in
              </Link>
              <Link to="/register" className="btn btn--sm hide-mobile">
                Book a survey
              </Link>
            </div>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="container hero__inner">
          <div>
            <span className="hero__eyebrow">
              <Icon name="compass" size={14} /> Licensed geodetic engineers · {office.city}, {office.province}
            </span>
            <h1>
              Land surveys you can <em>track</em> from start to finish.
            </h1>
            <p className="hero__lead">
              Book relocation, subdivision, boundary and topographic surveys online. Follow every stage, upload your
              documents securely, and view approved survey plans from your own account.
            </p>
            <div className="hero__actions">
              <Link to={user ? homeFor(user.role) : '/register'} className="btn btn--gold">
                <Icon name="calendarPlus" size={18} /> {user ? 'Open my portal' : 'Book a survey'}
              </Link>
              <a href="#services" className="btn btn--secondary">
                Explore services <Icon name="arrowRight" size={16} />
              </a>
            </div>
            <div className="hero__trust">
              <span><Icon name="shield" size={15} /> {office.prcLicense || 'PRC licensed'}</span>
              <span><Icon name="lock" size={15} /> Secure client records</span>
              <span><Icon name="file" size={15} /> Data Privacy Act aligned</span>
            </div>
          </div>

          <aside className="hero-card" aria-label="Office information">
            <h3>{isOpenNow ? 'The office is open now' : 'Visit the office'}</h3>
            <p>{isOpenNow ? `Today · until ${timeLabel(todayHours.closeTime)}` : `Today · ${hoursLabel(todayHours)}`}</p>
            <div className="hero-card__row">
              <Icon name="pin" size={17} />
              <span>{office.address}</span>
            </div>
            <div className="hero-card__row">
              <Icon name="phone" size={17} />
              <span>
                {office.phone}
                {office.mobile ? ` · ${office.mobile}` : ''}
              </span>
            </div>
            <div className="hero-card__row">
              <Icon name="clock" size={17} />
              <span>Monday to Saturday, by appointment</span>
            </div>
            <div className="hero-card__row">
              <Icon name="mail" size={17} />
              <span style={{ overflowWrap: 'anywhere' }}>{office.email}</span>
            </div>
            <Link to="/register" className="btn btn--block mt-2">
              Request an appointment
            </Link>
            <p className="tiny muted center" style={{ margin: '0.55rem 0 0' }}>
              No payment is taken online. The office confirms fees before fieldwork.
            </p>
          </aside>
        </div>
      </section>

      <section className="section" id="services">
        <div className="container">
          <div className="section__head">
            <span className="kicker">Survey services</span>
            <h2>What the office can prepare for you</h2>
            <p>
              Fees below are published starting rates. The office reviews the property details and confirms the final
              scope before scheduling fieldwork.
            </p>
          </div>
          {loading ? <Loading label="Loading services…" /> : null}
          {error && !data ? <ErrorState error={error} onRetry={() => reload()} /> : null}
          {services.length ? (
            <div className="service-grid">
              {services.map((service) => (
                <article className="service-card" key={service.id}>
                  <span className="service-card__icon">
                    <Icon name={serviceIcon(service)} size={22} />
                  </span>
                  <h3>{service.name}</h3>
                  <p>{service.description}</p>
                  <div className="service-card__meta">
                    <span>
                      <span className="service-card__fee">{money(service.baseFee)}</span>
                      <span className="muted tiny"> starting</span>
                      <span className="muted tiny" style={{ display: 'block' }}>
                        {service.requiresFieldwork ? 'Fieldwork included' : 'Office-based service'} · {plural(service.requirementCount, 'requirement')}
                      </span>
                    </span>
                    <Link to={`/register?service=${service.id}`} className="link-btn small">
                      Request <Icon name="arrowRight" size={13} style={{ verticalAlign: 'middle' }} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="section section--alt" id="process">
        <div className="container">
          <div className="section__head">
            <span className="kicker">A transparent process</span>
            <h2>From request to released plan</h2>
            <p>Every booking becomes a project record with a stage history, document checklist and secure file store.</p>
          </div>
          <div className="process">
            {PROCESS.map((step, index) => (
              <div className="process__step" key={step.title}>
                <span className="process__num">{index + 1}</span>
                <div>
                  <h4>{step.title}</h4>
                  <p>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="about">
        <div className="container about-grid">
          <div>
            <span className="kicker" style={{ color: 'var(--green-700)', fontWeight: 750, fontSize: '.7rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>
              About the practice
            </span>
            <h2 style={{ marginTop: '.4rem' }}>Careful fieldwork, defensible records.</h2>
            <p style={{ color: 'var(--gray-600)' }}>{office.about}</p>
            <p style={{ color: 'var(--gray-600)' }}>
              The firm works with landowners, developers, cooperatives and local government units. Every engagement is
              documented — from the first request and document checklist to field notes, drawing revisions and the
              final released plan.
            </p>
            <div className="btn-row mt-2">
              <a className="btn btn--secondary" href={mapUrl} target="_blank" rel="noreferrer noopener">
                <Icon name="map" size={17} /> Get directions
              </a>
              <a className="btn btn--ghost" href={`mailto:${office.email}`}>
                <Icon name="mail" size={17} /> Email the office
              </a>
            </div>
          </div>
          <div>
            <div className="about-facts">
              <div className="fact"><b>2009</b><span>Established</span></div>
              <div className="fact"><b>{services.length || 7}</b><span>Services</span></div>
              <div className="fact"><b>10 yr</b><span>Record retention</span></div>
              <div className="fact"><b>PRC</b><span>Licensed team</span></div>
            </div>
            <div className="card mt-2">
              <div className="section-title" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: '.98rem' }}>Office hours</h2>
                <span className={`badge badge--${isOpenNow ? 'green' : 'slate'}`}>{isOpenNow ? 'Open now' : 'Closed now'}</span>
              </div>
              <ul className="mini-list">
                {hours.length ? (
                  hours.map((row) => (
                    <li key={row.weekday} style={{ padding: '.35rem 0' }}>
                      <span className="small" style={{ flex: 1 }}>
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][row.weekday]}
                      </span>
                      <span className="small strong">{hoursLabel(row)}</span>
                    </li>
                  ))
                ) : (
                  <li className="small muted">Office hours are posted at the front desk.</li>
                )}
              </ul>
              <p className="tiny muted" style={{ margin: '.5rem 0 0' }}>
                {dateLong(today)} · Times are Philippine Standard Time (UTC+8).
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--alt" id="contact">
        <div className="container">
          <div className="cta-band mb-3">
            <div>
              <h2>Ready to start your survey?</h2>
              <p>Create a client account, choose a service and pick an available field slot. The office reviews every request before confirming.</p>
            </div>
            <Link to="/register" className="btn btn--gold">
              Create an account <Icon name="arrowRight" size={16} />
            </Link>
          </div>

          <div className="contact-grid">
            <div>
              <span className="kicker" style={{ color: 'var(--green-700)', fontWeight: 750, fontSize: '.7rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                Contact
              </span>
              <h2 style={{ marginTop: '.4rem' }}>Talk to the office</h2>
              <p className="muted">For urgent fieldwork concerns, call the office directly. Website messages are reviewed during business hours.</p>
              <div className="contact-list mt-2">
                <div className="contact-item">
                  <Icon name="pin" size={18} />
                  <div><b>Office address</b>{office.address}</div>
                </div>
                <div className="contact-item">
                  <Icon name="phone" size={18} />
                  <div><b>Telephone</b>{office.phone}{office.mobile ? ` · ${office.mobile}` : ''}</div>
                </div>
                <div className="contact-item">
                  <Icon name="mail" size={18} />
                  <div><b>Email</b><a href={`mailto:${office.email}`}>{office.email}</a></div>
                </div>
                <div className="contact-item">
                  <Icon name="shield" size={18} />
                  <div><b>Data protection officer</b>{office.privacyOfficer} · <a href={`mailto:${office.privacyEmail}`}>{office.privacyEmail}</a></div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Send a message</h3>
              <p className="small muted">Your message is stored in the office system for follow-up. This website does not send automated email replies.</p>
              {sent ? (
                <Alert tone="success" title="Message received">
                  Thank you. The office will get back to you during business hours. You can also create an account to book a
                  survey slot directly.
                </Alert>
              ) : null}
              <form onSubmit={submitInquiry} noValidate className="mt-2">
                <div className="form-grid form-grid--2">
                  <div className="field">
                    <label className="field__label" htmlFor="inq-name">Name <span className="req">*</span></label>
                    <input id="inq-name" className="input" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} />
                    {errors.name ? <div className="field__error">{errors.name}</div> : null}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="inq-phone">Phone</label>
                    <input id="inq-phone" className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" aria-invalid={!!errors.phone} />
                    {errors.phone ? <div className="field__error">{errors.phone}</div> : null}
                  </div>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="inq-email">Email <span className="req">*</span></label>
                  <input id="inq-email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" aria-invalid={!!errors.email} />
                  {errors.email ? <div className="field__error">{errors.email}</div> : null}
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="inq-subject">Subject <span className="req">*</span></label>
                  <input id="inq-subject" className="input" value={form.subject} onChange={set('subject')} aria-invalid={!!errors.subject} />
                  {errors.subject ? <div className="field__error">{errors.subject}</div> : null}
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="inq-message">Message <span className="req">*</span></label>
                  <textarea id="inq-message" className="textarea" rows={4} value={form.message} onChange={set('message')} aria-invalid={!!errors.message} />
                  {errors.message ? <div className="field__error">{errors.message}</div> : null}
                </div>
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
                  <label htmlFor="inq-website">Website</label>
                  <input id="inq-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </div>
                <label className="checkbox">
                  <input type="checkbox" checked={form.privacyAccepted} onChange={set('privacyAccepted')} aria-invalid={!!errors.privacyAccepted} />
                  <span>
                    I have read the <Link to="/privacy">privacy notice</Link> and agree to the office storing this message to
                    respond to my inquiry. <span className="req">*</span>
                  </span>
                </label>
                {errors.privacyAccepted ? <div className="field__error">{errors.privacyAccepted}</div> : null}
                <button type="submit" className="btn btn--block mt-2" disabled={sending}>
                  {sending ? <span className="spinner" /> : <Icon name="send" size={17} />}
                  {sending ? 'Sending…' : 'Send message'}
                </button>
                {errors._ ? <div className="field__error mt-1">{errors._}</div> : null}
              </form>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container">
          <div className="site-footer__grid">
            <div>
              <div className="logo" style={{ marginBottom: '.6rem' }}>
                <LogoMark size={36} />
                <span className="logo__text">
                  <b style={{ color: '#fff' }}>Trompeta Surveying</b>
                  <span style={{ color: 'rgba(255,255,255,.5)' }}>Services</span>
                </span>
              </div>
              <p style={{ maxWidth: '34ch' }}>{office.tagline}. Serving landowners and developers across {office.province} and nearby provinces.</p>
              <p className="tiny" style={{ marginBottom: 0 }}>{office.prcLicense}</p>
            </div>
            <div>
              <h4>Services</h4>
              <ul>
                {services.slice(0, 5).map((service) => (
                  <li key={service.id}>
                    <a href="#services">{service.shortName || service.name}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Client portal</h4>
              <ul>
                <li><Link to="/login">Sign in</Link></li>
                <li><Link to="/register">Create an account</Link></li>
                <li><Link to="/privacy">Privacy notice</Link></li>
                <li><a href={`mailto:${office.email}`}>Contact the office</a></li>
              </ul>
            </div>
          </div>
          <div className="site-footer__bottom">
            <span>© {new Date().getFullYear()} {office.companyName}. All rights reserved.</span>
            <span>Records retained for {office.retentionYears} years · Philippine Data Privacy Act (RA 10173)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
