import { Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { usePageTitle } from '../../hooks.js';
import { Icon, LogoMark } from '../../components/Icons.jsx';
import { homeFor } from '../../utils.js';

export default function NotFound() {
  usePageTitle('Page not found');
  const { user, loading } = useAuth();

  return (
    <div className="auth-wrap" style={{ minHeight: '100dvh' }}>
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
              Error 404
            </span>
            <h2>This page is off the map.</h2>
            <p>The link may be old, mistyped, or the record may have been moved. Nothing was changed on your account.</p>
          </div>
        </div>
      </aside>

      <main className="auth-card">
        <div className="empty" style={{ padding: '2rem 0 1rem' }}>
          <Icon name="compass" size={54} style={{ color: 'var(--gray-300)', margin: '0 auto .6rem', display: 'block' }} />
          <h1 style={{ fontSize: '2.4rem', marginBottom: '.2rem' }}>404</h1>
          <h2 style={{ fontSize: '1.05rem' }}>Page not found</h2>
          <p className="muted">We could not find that page in the website or portal.</p>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <Link to="/" className="btn btn--secondary">Go to the website</Link>
            {!loading ? (
              user ? (
                <Link to={homeFor(user.role)} className="btn"><Icon name="dashboard" size={16} /> Open my dashboard</Link>
              ) : (
                <Link to="/login" className="btn"><Icon name="lock" size={16} /> Sign in</Link>
              )
            ) : null}
          </div>
        </div>
        <p className="tiny muted center">
          If you followed a link from inside the portal, report it to the office so the record can be checked.
        </p>
      </main>
    </div>
  );
}
