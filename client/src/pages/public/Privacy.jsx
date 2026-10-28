import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync, usePageTitle } from '../../hooks.js';
import { Icon, LogoMark } from '../../components/Icons.jsx';
import { Loading } from '../../components/ui.jsx';
import { dateLong, todayISO } from '../../utils.js';

const FALLBACK = {
  companyName: 'Trompeta Surveying',
  address: 'Unit 4B, Rizal Commercial Center, 128 Mabini Street, Barangay Poblacion, San Fernando, Pampanga',
  email: 'office@trompetasurveying.ph',
  phone: '(045) 861-4420',
  privacyOfficer: 'Atty. Maria Lourdes Santos',
  privacyEmail: 'privacy@trompetasurveying.ph',
  retentionYears: 10,
};

const COLLECTED = [
  {
    title: 'Identity and contact details',
    body: 'Name, email address, mobile or telephone number, and, where required, a valid government ID type and number supplied by you for engagement and verification.',
  },
  {
    title: 'Property and engagement records',
    body: 'Lot, block, barangay, city or municipality, province, title and tax declaration references, coordinates, area, survey notes, field measurements and correspondence about the engagement.',
  },
  {
    title: 'Documents you upload',
    body: 'Titles, tax declarations, sketches, clearances, permits and other files you choose to attach. Files are stored outside the public web root and served only through authenticated endpoints.',
  },
  {
    title: 'Account and security logs',
    body: 'Hashed password, session records (IP address, browser user-agent, sign-in times), failed sign-in attempts and an audit trail of actions taken in the portal.',
  },
  {
    title: 'Website inquiries',
    body: 'The name, email, phone, subject and message you submit through the public contact form, stored so the office can respond.',
  },
];

const PURPOSES = [
  'Assess and schedule the surveying service you request.',
  'Prepare, review and release survey plans and related documents.',
  'Coordinate fieldwork with the assigned licensed surveyor and field team.',
  'Maintain professional and statutory records for the retention period.',
  'Protect the portal against unauthorised access and investigate misuse.',
  'Respond to your inquiries and service messages.',
];

const RIGHTS = [
  ['Right to be informed', 'Know what personal data is collected, why, and how it is used and stored.'],
  ['Right to object', 'Object to processing based on legitimate interests, subject to legal and contractual limits.'],
  ['Right to access', 'Request a copy of the personal data the office holds about you.'],
  ['Right to rectify', 'Ask that inaccurate or incomplete personal data be corrected.'],
  ['Right to erasure or blocking', 'Request erasure or blocking where the law allows. Survey records with statutory retention obligations may not be erased immediately.'],
  ['Right to damages', 'Seek compensation for damage caused by inaccurate, incomplete, outdated or unlawfully obtained personal data.'],
  ['Right to data portability', 'Receive your data in a structured, commonly used electronic format where technically feasible.'],
  ['Right to complain', 'Lodge a complaint with the National Privacy Commission (privacy.gov.ph).'],
];

export default function Privacy() {
  usePageTitle('Privacy notice');
  const { data, loading } = useAsync(() => api.get('/public/office'), []);
  const office = data?.office || FALLBACK;

  return (
    <div className="landing">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="logo">
            <LogoMark size={40} />
            <span className="logo__text">
              <b>Trompeta Surveying</b>
              <span>Land surveying</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Main">
            <Link to="/">Home</Link>
            <Link to="/#services">Services</Link>
            <Link to="/#contact">Contact</Link>
            <Link to="/login">Sign in</Link>
          </nav>
          <Link to="/register" className="btn btn--sm" style={{ marginLeft: 'auto' }}>
            Create account
          </Link>
        </div>
      </header>

      <section className="section" style={{ paddingTop: '2rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <span className="kicker" style={{ color: 'var(--green-700)', fontWeight: 750, fontSize: '.7rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>
            Data privacy
          </span>
          <h1 style={{ marginTop: '.35rem' }}>Privacy notice</h1>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            {office.companyName} processes personal data in line with the Philippine Data Privacy Act of 2012
            (Republic Act No. 10173), its implementing rules and regulations, and National Privacy Commission issuances.
            This notice explains what the office collects through this website and the client portal, why it is collected,
            and the choices available to you.
          </p>
          <p className="tiny muted">
            Notice version 1.0 · Effective {dateLong(todayISO())} · This page is informational and does not replace the
            engagement contract or the office's full privacy manual.
          </p>

          {loading ? <Loading label="Loading office details…" /> : null}

          <div className="alert alert--info mb-3" style={{ marginTop: '1rem' }}>
            <Icon name="shield" size={18} />
            <div>
              <strong>Who is responsible for your data?</strong>
              <div className="small" style={{ marginTop: 3 }}>
                {office.companyName}, {office.address}. Data Protection Officer: {office.privacyOfficer},{' '}
                <a href={`mailto:${office.privacyEmail}`}>{office.privacyEmail}</a>. You may also contact the office at{' '}
                {office.phone} or <a href={`mailto:${office.email}`}>{office.email}</a>.
              </div>
            </div>
          </div>

          <div className="card">
            <h2>1. Personal data we collect</h2>
            <p className="muted small">
              We collect only what is needed to deliver surveying services and operate the portal. Providing mandatory
              fields is necessary to create an account and request a service; optional fields may be left blank.
            </p>
            <div className="stack-sm mt-2">
              {COLLECTED.map((item) => (
                <div key={item.title} className="panel" style={{ padding: '.85rem' }}>
                  <h4 style={{ marginBottom: '.2rem' }}>{item.title}</h4>
                  <p className="small muted" style={{ margin: 0 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card mt-2">
            <h2>2. Why we process it</h2>
            <p className="muted small">Processing is based on your consent, the performance of our engagement, compliance with legal obligations, and the office's legitimate interest in protecting its records and systems.</p>
            <ul className="mini-list">
              {PURPOSES.map((purpose) => (
                <li key={purpose}>
                  <Icon name="check" size={16} />
                  <span className="small">{purpose}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card mt-2">
            <h2>3. Who can see your records</h2>
            <div className="stack-sm">
              <p className="small" style={{ margin: 0 }}>
                <strong>Clients</strong> can see only their own appointments, projects, documents, drawings, messages and notifications.
                Server-side checks run on every request; changing a URL or identifier does not grant access.
              </p>
              <p className="small" style={{ margin: 0 }}>
                <strong>Surveyors and field staff</strong> can see the projects they lead or are assigned to, plus the property details needed
                for fieldwork. They cannot open office settings, other clients' accounts, or unrelated projects.
              </p>
              <p className="small" style={{ margin: 0 }}>
                <strong>Administrators</strong> can see office-wide records to schedule work, review documents and maintain the practice.
                Administrative actions are recorded in an audit log with the actor, time and IP address.
              </p>
              <p className="small" style={{ margin: 0 }}>
                <strong>Service providers</strong> are limited to hosting and infrastructure needed to run the portal. The office does not sell
                personal data. Data is not transferred outside the Philippines except where a provider's infrastructure requires it and
                appropriate safeguards are in place.
              </p>
            </div>
          </div>

          <div className="card mt-2">
            <h2>4. How data is protected</h2>
            <ul className="mini-list">
              <li><Icon name="lock" size={16} /><span className="small">Passwords are stored as bcrypt hashes, never in plain text.</span></li>
              <li><Icon name="shield" size={16} /><span className="small">Sessions are server-side, stored as SHA-256 hashes, sent in an httpOnly cookie, and invalidated on sign-out, deactivation or password change.</span></li>
              <li><Icon name="file" size={16} /><span className="small">Uploaded files are validated by type and size, stored outside the public web root, and served only through authenticated endpoints.</span></li>
              <li><Icon name="activity" size={16} /><span className="small">Sign-in throttling, CSRF protection, security headers and an audit trail reduce the risk of unauthorised access.</span></li>
            </ul>
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              No system is completely secure. If the office becomes aware of a personal data breach, it will notify affected
              individuals and the National Privacy Commission as required by law.
            </p>
          </div>

          <div className="card mt-2">
            <h2>5. Retention and disposal</h2>
            <p className="small muted">
              Survey records, plans and related professional documents are retained for at least {office.retentionYears} years
              from completion or the last transaction, unless a longer period is required by law or a pending case. Account
              security logs are kept only as long as needed for security and investigation. When retention ends, records are
              securely deleted or anonymised. Documents under a legal hold are not disposed of until the hold is lifted.
            </p>
            <p className="small muted" style={{ marginBottom: 0 }}>
              You may request deletion of optional profile information at any time. Records required for a completed survey
              may be blocked from further processing but retained to meet statutory and professional obligations.
            </p>
          </div>

          <div className="card mt-2">
            <h2>6. Your rights</h2>
            <div className="table-wrap">
              <table className="table table--cards">
                <thead>
                  <tr><th>Right</th><th>What it means</th></tr>
                </thead>
                <tbody>
                  {RIGHTS.map(([title, body]) => (
                    <tr key={title}>
                      <td data-label="Right" className="cell-main">{title}</td>
                      <td data-label="Meaning">{body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted mt-2" style={{ marginBottom: 0 }}>
              To exercise a right, email <a href={`mailto:${office.privacyEmail}`}>{office.privacyEmail}</a> with enough
              detail to identify your account and request. The office will verify your identity and respond within the period
              required by the NPC. You may also file a complaint with the National Privacy Commission at{' '}
              <a href="https://privacy.gov.ph" target="_blank" rel="noreferrer noopener">privacy.gov.ph</a>.
            </p>
          </div>

          <div className="card mt-2">
            <h2>7. Cookies and local storage</h2>
            <p className="small muted" style={{ marginBottom: 0 }}>
              The portal uses a strictly necessary session cookie (<code>trs_sid</code>) to keep you signed in and a readable
              CSRF cookie (<code>trs_csrf</code>) to protect forms against cross-site request forgery. These cookies are not used
              for advertising or third-party analytics. The site stores no marketing trackers. Clearing cookies signs you out.
            </p>
          </div>

          <div className="card mt-2">
            <h2>8. Automated email and SMS</h2>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Email and SMS delivery are <strong>not configured</strong> in this deployment. Notifications appear inside the
              portal only. The office will contact you by phone or email using the details on file when direct communication is
              needed. Do not rely on the portal for urgent or time-critical notices.
            </p>
          </div>

          <div className="card mt-2">
            <h2>9. Changes to this notice</h2>
            <p className="small muted" style={{ marginBottom: 0 }}>
              The office may update this notice to reflect changes in law, services or systems. Material changes will be
              announced in the portal. The version and effective date at the top of this page identify the current notice.
            </p>
          </div>

          <div className="btn-row mt-3">
            <Link to="/" className="btn btn--secondary"><Icon name="arrowLeft" size={16} /> Back to website</Link>
            <Link to="/register" className="btn">Create an account</Link>
            <a className="btn btn--ghost" href={`mailto:${office.privacyEmail}`}><Icon name="mail" size={16} /> Contact the DPO</a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container site-footer__bottom" style={{ marginTop: 0, borderTop: 0 }}>
          <span>© {new Date().getFullYear()} {office.companyName}. All rights reserved.</span>
          <span><Link to="/">Website</Link> · <Link to="/login">Sign in</Link> · <Link to="/privacy">Privacy</Link></span>
        </div>
      </footer>
    </div>
  );
}
