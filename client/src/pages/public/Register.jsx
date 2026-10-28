import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast, Alert } from '../../components/ui.jsx';
import { Icon, LogoMark } from '../../components/Icons.jsx';
import { usePageTitle } from '../../hooks.js';
import { money } from '../../utils.js';

const EMPTY = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  addressLine: '',
  barangay: '',
  cityMunicipality: '',
  province: '',
  privacyAccepted: false,
};

export default function Register() {
  usePageTitle('Create a client account');
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [services, setServices] = useState([]);
  const [showPassword, setShowPassword] = useState(false);

  const serviceId = Number(params.get('service')) || null;
  const next = params.get('next') || '';

  useEffect(() => {
    let alive = true;
    api
      .get('/public/services')
      .then((data) => {
        if (alive) setServices(data.services || []);
      })
      .catch(() => {
        /* the service list is only a convenience */
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) || null,
    [services, serviceId],
  );

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, _: undefined }));
  };

  function validate() {
    const next = {};
    if (!form.fullName.trim()) next.fullName = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.password.length < 10) next.password = 'Use at least 10 characters.';
    else if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      next.password = 'Include at least one letter and one number.';
    }
    if (form.password !== form.confirmPassword) next.confirmPassword = 'The passwords do not match.';
    if (!form.privacyAccepted) next.privacyAccepted = 'Please accept the privacy notice.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || null,
        addressLine: form.addressLine.trim() || null,
        barangay: form.barangay.trim() || null,
        cityMunicipality: form.cityMunicipality.trim() || null,
        province: form.province.trim() || null,
        privacyAccepted: form.privacyAccepted,
      });
      toast.success('Your account is ready. Choose a service and book your survey.', 'Account created');
      const target = selectBookingTarget(serviceId, next);
      navigate(target, { replace: true });
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setErrors((prev) => ({ ...prev, _: err.message }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <div className="auth-side__content">
          <Link to="/" className="logo">
            <LogoMark size={44} />
            <span className="logo__text">
              <b style={{ color: '#fff' }}>Trompeta Surveying</b>
              <span style={{ color: 'rgba(255,255,255,.55)' }}>Survey management</span>
            </span>
          </Link>
          <div style={{ marginTop: 'auto' }}>
            <span className="badge badge--amber" style={{ background: 'rgba(184,145,47,.18)', borderColor: 'rgba(231,201,106,.35)', color: '#f2dda0' }}>
              New client registration
            </span>
            <h2>Start with your property details.</h2>
            <p>
              An account lets you request a survey slot, upload requirements, follow the project stage and keep every
              released document in one secure place.
            </p>
            <ul>
              <li><Icon name="check" size={17} /> No payment is taken online</li>
              <li><Icon name="check" size={17} /> The office confirms fees before fieldwork</li>
              <li><Icon name="check" size={17} /> Your records are private to your account</li>
            </ul>
          </div>
          <p className="tiny" style={{ color: 'rgba(255,255,255,.45)', margin: '1.5rem 0 0' }}>
            Data Privacy Act (RA 10173) aligned
          </p>
        </div>
      </aside>

      <main className="auth-card">
        <Link to="/" className="logo">
          <LogoMark size={38} />
          <span className="logo__text">
            <b>Trompeta Surveying</b>
            <span>Land surveying</span>
          </span>
        </Link>

        <h1>Create your client account</h1>
        <p className="lead">Only the account owner can see the appointments and documents attached to it.</p>

        {selectedService ? (
          <Alert tone="info" title={`Booking: ${selectedService.name}`}>
            {money(selectedService.baseFee)} starting fee · {selectedService.durationMinutes} minute field visit.
            You will choose a date and time after creating the account.
          </Alert>
        ) : null}

        {errors._ ? (
          <div className="mt-2">
            <Alert tone="danger" title="Could not create the account">{errors._}</Alert>
          </div>
        ) : null}

        <form onSubmit={submit} noValidate className="mt-2">
          <div className="field">
            <label className="field__label" htmlFor="reg-name">Full name <span className="req">*</span></label>
            <input id="reg-name" className="input" value={form.fullName} onChange={set('fullName')} autoComplete="name" aria-invalid={!!errors.fullName} />
            {errors.fullName ? <div className="field__error">{errors.fullName}</div> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="reg-email">Email address <span className="req">*</span></label>
            <input id="reg-email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" aria-invalid={!!errors.email} />
            {errors.email ? <div className="field__error">{errors.email}</div> : null}
            <div className="field__hint">This becomes your sign-in name. Automated email verification is not configured.</div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="reg-phone">Mobile or telephone</label>
            <input id="reg-phone" className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" aria-invalid={!!errors.phone} placeholder="+63 9xx xxx xxxx" />
            {errors.phone ? <div className="field__error">{errors.phone}</div> : null}
          </div>

          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="reg-password">Password <span className="req">*</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  className="input"
                  style={{ paddingRight: '3.1rem' }}
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                />
                <button type="button" className="link-btn small" style={{ position: 'absolute', right: '.7rem', top: '50%', transform: 'translateY(-50%)' }} onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password ? <div className="field__error">{errors.password}</div> : null}
              <div className="field__hint">At least 10 characters with a letter and a number.</div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="reg-confirm">Confirm password <span className="req">*</span></label>
              <input id="reg-confirm" className="input" type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" aria-invalid={!!errors.confirmPassword} />
              {errors.confirmPassword ? <div className="field__error">{errors.confirmPassword}</div> : null}
            </div>
          </div>

          <h2 style={{ fontSize: '.95rem', marginTop: '.4rem' }}>Property address <span className="muted tiny">(optional — can be added when booking)</span></h2>
          <div className="field">
            <label className="field__label" htmlFor="reg-address">House / street / subdivision</label>
            <input id="reg-address" className="input" value={form.addressLine} onChange={set('addressLine')} autoComplete="street-address" />
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="reg-barangay">Barangay</label>
              <input id="reg-barangay" className="input" value={form.barangay} onChange={set('barangay')} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="reg-city">City / municipality</label>
              <input id="reg-city" className="input" value={form.cityMunicipality} onChange={set('cityMunicipality')} />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="reg-province">Province</label>
            <input id="reg-province" className="input" value={form.province} onChange={set('province')} />
          </div>

          <label className="checkbox">
            <input type="checkbox" checked={form.privacyAccepted} onChange={set('privacyAccepted')} aria-invalid={!!errors.privacyAccepted} />
            <span>
              I have read the <Link to="/privacy" target="_blank" rel="noreferrer">privacy notice</Link> and agree that the
              office may store the information I provide to deliver surveying services. <span className="req">*</span>
            </span>
          </label>
          {errors.privacyAccepted ? <div className="field__error">{errors.privacyAccepted}</div> : null}

          <button type="submit" className="btn btn--block mt-2" disabled={submitting}>
            {submitting ? <span className="spinner" /> : <Icon name="userCheck" size={17} />}
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="small center mt-2">
          Already registered? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link>
        </p>
        <p className="tiny muted center">
          By creating an account you agree to use the portal only for your own property records. Attempts to access other
          clients' records are logged and blocked.
        </p>
      </main>
    </div>
  );
}

function selectBookingTarget(serviceId, next) {
  if (next && next.startsWith('/app') && !next.startsWith('//')) return next;
  return serviceId ? `/app/book?service=${serviceId}` : '/app/book';
}
