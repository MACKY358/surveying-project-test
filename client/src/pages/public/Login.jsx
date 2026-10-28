import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { useToast, Alert } from '../../components/ui.jsx';
import { Icon, LogoMark } from '../../components/Icons.jsx';
import { usePageTitle } from '../../hooks.js';
import { homeFor } from '../../utils.js';

// Demo credentials are seeded by server/db/seed.js.
// REMOVE THIS BLOCK (and the seed accounts) before going live.
const DEMO_ACCOUNTS = [
  {
    role: 'Administrator',
    name: 'Office administrator',
    email: 'admin@trompetasurveying.ph',
    password: 'Admin#2026',
  },
  {
    role: 'Surveyor',
    name: 'Engr. Rafael Reyes',
    email: 'rafael.reyes@trompetasurveying.ph',
    password: 'Survey#2026',
  },
  {
    role: 'Surveyor',
    name: 'Engr. Bianca Cruz',
    email: 'bianca.cruz@trompetasurveying.ph',
    password: 'Survey#2026',
  },
  {
    role: 'Client',
    name: 'Maria Santos',
    email: 'maria.santos@gmail.com',
    password: 'Client#2026',
  },
  {
    role: 'Client',
    name: 'Juan Dela Cruz',
    email: 'juan.delacruz@gmail.com',
    password: 'Client#2026',
  },
];

const ROLE_TONE = { Administrator: 'amber', Surveyor: 'teal', Client: 'green' };

export default function Login() {
  usePageTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const next = params.get('next') || '';

  const set = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, _: undefined }));
  };

  function fillDemo(account) {
    setForm({ email: account.email, password: account.password });
    setErrors({});
  }

  function destination(role) {
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      const prefix = role === 'admin' ? '/admin' : role === 'surveyor' ? '/staff' : '/app';
      if (next === prefix || next.startsWith(`${prefix}/`)) return next;
    }
    return homeFor(role);
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const user = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}.`, 'Signed in');
      navigate(destination(user.role), { replace: true });
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setErrors((prev) => ({ ...prev, _: err.message }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-side" aria-label="About the portal">
        <div className="auth-side__content">
          <Link to="/" className="logo" aria-label="Trompeta Surveying home">
            <LogoMark size={44} />
            <span className="logo__text">
              <b style={{ color: '#fff' }}>Trompeta Surveying</b>
              <span style={{ color: 'rgba(255,255,255,.55)' }}>Survey management</span>
            </span>
          </Link>
          <div style={{ marginTop: 'auto' }}>
            <span className="badge badge--amber" style={{ background: 'rgba(184,145,47,.18)', borderColor: 'rgba(231,201,106,.35)', color: '#f2dda0' }}>
              Client &amp; office portal
            </span>
            <h2>Every survey, document and schedule in one place.</h2>
            <p>
              Clients follow their project from request to released plan. The office manages appointments, fieldwork,
              document review and records with a complete audit trail.
            </p>
            <ul>
              <li><Icon name="calendar" size={17} /> Book and reschedule field visits</li>
              <li><Icon name="file" size={17} /> Upload requirements and track review</li>
              <li><Icon name="layers" size={17} /> View approved survey plans securely</li>
              <li><Icon name="shield" size={17} /> Role-based access and activity logs</li>
            </ul>
          </div>
          <p className="tiny" style={{ color: 'rgba(255,255,255,.45)', margin: '1.5rem 0 0' }}>
            {new Date().getFullYear()} Trompeta Surveying · San Fernando, Pampanga
          </p>
        </div>
      </aside>

      <main className="auth-card">
        <Link to="/" className="logo" aria-label="Back to the website">
          <LogoMark size={38} />
          <span className="logo__text">
            <b>Trompeta Surveying</b>
            <span>Land surveying</span>
          </span>
        </Link>

        <h1>Sign in to your account</h1>
        <p className="lead">Use the email address registered with the office.</p>

        {next ? (
          <Alert tone="info" title="Sign in to continue">
            You were asked to sign in before opening that page.
          </Alert>
        ) : null}

        {errors._ ? (
          <div className="mt-2">
            <Alert tone="danger" title="Could not sign in">
              {errors._}
            </Alert>
          </div>
        ) : null}

        <form onSubmit={submit} noValidate className="mt-2">
          <div className="field">
            <label className="field__label" htmlFor="login-email">Email address <span className="req">*</span></label>
            <input
              id="login-email"
              className="input"
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              inputMode="email"
              required
              aria-invalid={!!errors.email}
              placeholder="you@example.com"
            />
            {errors.email ? <div className="field__error">{errors.email}</div> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="login-password">Password <span className="req">*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                className="input"
                style={{ paddingRight: '3.1rem' }}
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                autoComplete="current-password"
                required
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                className="link-btn small"
                style={{ position: 'absolute', right: '.7rem', top: '50%', transform: 'translateY(-50%)' }}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password ? <div className="field__error">{errors.password}</div> : null}
          </div>

          <button type="submit" className="btn btn--block" disabled={submitting}>
            {submitting ? <span className="spinner" /> : <Icon name="lock" size={17} />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="small center mt-2">
          New client? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
        </p>
        <p className="tiny muted center">
          Forgot your password? Contact the office at{' '}
          <a href="mailto:office@trompetasurveying.ph">office@trompetasurveying.ph</a> or call (045) 861-4420. Automated
          password reset email is not configured.
        </p>

        <div className="demo-box mt-3">
          <b>Demo accounts for evaluation</b>
          <p className="tiny" style={{ marginBottom: '.45rem' }}>
            These are seeded test accounts. Remove them from the seed data and delete this panel before going live.
          </p>
          {DEMO_ACCOUNTS.map((account) => (
            <div className="demo-account" key={account.email}>
              <div style={{ minWidth: 0 }}>
                <span className={`badge badge--${ROLE_TONE[account.role]}`}>{account.role}</span>
                <div className="small strong" style={{ marginTop: 2 }}>{account.name}</div>
                <div className="tiny muted mono wrap-anywhere">{account.email}</div>
                <div className="tiny muted mono">{account.password}</div>
              </div>
              <button type="button" className="btn btn--secondary btn--xs" onClick={() => fillDemo(account)}>
                Use
              </button>
            </div>
          ))}
        </div>

        <p className="tiny muted center" style={{ marginTop: '1.2rem' }}>
          <Link to="/privacy">Privacy notice</Link> · <Link to="/">Back to website</Link>
        </p>
      </main>
    </div>
  );
}
