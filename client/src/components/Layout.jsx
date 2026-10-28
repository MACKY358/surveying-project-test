import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useConfirm } from './ui.jsx';
import { Icon, LogoMark } from './Icons.jsx';
import { cn, homeFor, roleLabel } from '../utils.js';
import { api } from '../api.js';

const NAV = {
  client: [
    {
      label: 'Overview',
      items: [
        { to: '/app', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/app/book', label: 'Book a Survey', icon: 'calendarPlus' },
        { to: '/app/appointments', label: 'Appointments', icon: 'calendar' },
        { to: '/app/projects', label: 'My Projects', icon: 'folder' },
      ],
    },
    {
      label: 'Records',
      items: [
        { to: '/app/documents', label: 'Documents', icon: 'file' },
        { to: '/app/blueprints', label: 'Survey Plans', icon: 'layers' },
      ],
    },
    {
      label: 'Office',
      items: [
        { to: '/app/messages', label: 'Messages', icon: 'message' },
        { to: '/app/notifications', label: 'Notifications', icon: 'bell', badge: true },
      ],
    },
    { label: 'Account', items: [{ to: '/app/profile', label: 'My Profile', icon: 'user' }] },
  ],
  admin: [
    {
      label: 'Operations',
      items: [
        { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/admin/appointments', label: 'Appointment Requests', icon: 'calendar' },
        { to: '/admin/calendar', label: 'Schedule Calendar', icon: 'clock' },
        { to: '/admin/projects', label: 'Projects', icon: 'folder' },
        { to: '/admin/documents', label: 'Document Review', icon: 'clipboard' },
        { to: '/admin/blueprints', label: 'Survey Plans', icon: 'layers' },
      ],
    },
    {
      label: 'People',
      items: [
        { to: '/admin/clients', label: 'Clients', icon: 'users' },
        { to: '/admin/staff', label: 'Surveyors & Staff', icon: 'briefcase' },
        { to: '/admin/inquiries', label: 'Website Inquiries', icon: 'mail' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { to: '/admin/reports', label: 'Reports & Exports', icon: 'chart' },
        { to: '/admin/activity', label: 'Activity Log', icon: 'activity' },
      ],
    },
    {
      label: 'Office',
      items: [
        { to: '/admin/messages', label: 'Messages', icon: 'message' },
        { to: '/admin/notifications', label: 'Notifications', icon: 'bell', badge: true },
        { to: '/admin/services', label: 'Services & Fees', icon: 'ruler' },
        { to: '/admin/settings', label: 'Settings', icon: 'settings' },
      ],
    },
  ],
  surveyor: [
    {
      label: 'Fieldwork',
      items: [
        { to: '/staff', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/staff/schedule', label: 'My Schedule', icon: 'calendar' },
        { to: '/staff/projects', label: 'Assigned Projects', icon: 'folder' },
      ],
    },
    {
      label: 'Office',
      items: [
        { to: '/staff/messages', label: 'Messages', icon: 'message' },
        { to: '/staff/notifications', label: 'Notifications', icon: 'bell', badge: true },
        { to: '/staff/profile', label: 'My Profile', icon: 'user' },
      ],
    },
  ],
};

const BOTTOM = {
  client: [
    { to: '/app', label: 'Home', icon: 'home', end: true },
    { to: '/app/book', label: 'Book', icon: 'calendarPlus' },
    { to: '/app/appointments', label: 'Visits', icon: 'calendar' },
    { to: '/app/projects', label: 'Projects', icon: 'folder' },
    { more: true, label: 'More', icon: 'more' },
  ],
  admin: [
    { to: '/admin', label: 'Home', icon: 'home', end: true },
    { to: '/admin/appointments', label: 'Requests', icon: 'calendar', badgeKey: 'pending' },
    { to: '/admin/calendar', label: 'Calendar', icon: 'clock' },
    { to: '/admin/projects', label: 'Projects', icon: 'folder' },
    { more: true, label: 'More', icon: 'more' },
  ],
  surveyor: [
    { to: '/staff', label: 'Home', icon: 'home', end: true },
    { to: '/staff/schedule', label: 'Schedule', icon: 'calendar' },
    { to: '/staff/projects', label: 'Projects', icon: 'folder' },
    { to: '/staff/messages', label: 'Messages', icon: 'message' },
    { more: true, label: 'More', icon: 'more' },
  ],
};

function matchTitle(pathname, role) {
  const groups = NAV[role] || [];
  const all = groups.flatMap((g) => g.items);
  const exact = all.find((item) => item.to === pathname);
  if (exact) return exact.label;
  const nested = all
    .filter((item) => item.to !== homeFor(role) && pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return nested ? nested.label : roleLabel(role);
}

export default function Layout() {
  const { user, logout, unread, refreshUnread } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return undefined;
    refreshUnread();
    const timer = window.setInterval(() => refreshUnread(), 60000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const groups = NAV[user?.role] || [];
  const bottom = BOTTOM[user?.role] || [];
  const title = useMemo(() => matchTitle(location.pathname, user?.role), [location.pathname, user?.role]);
  const home = homeFor(user?.role);
  const profilePath = user?.role === 'admin' ? '/admin/profile' : user?.role === 'surveyor' ? '/staff/profile' : '/app/profile';
  const notificationsPath = user?.role === 'admin' ? '/admin/notifications' : user?.role === 'surveyor' ? '/staff/notifications' : '/app/notifications';

  async function handleLogout() {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to enter your email and password to sign back in.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <aside className={cn('sidebar', open && 'sidebar--open')} aria-label="Main navigation">
        <Link to={home} className="sidebar__brand">
          <LogoMark size={36} />
          <span className="brand-text">
            <b>Trompeta Surveying</b>
            <span>Survey management</span>
          </span>
          <button
            type="button"
            className="icon-btn"
            style={{ marginLeft: 'auto', color: '#fff', display: 'inline-grid' }}
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="close" size={20} />
          </button>
        </Link>

        <nav style={{ flex: 1 }}>
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group__label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn('nav-item', isActive && 'active')}
                >
                  <Icon name={item.icon} size={19} />
                  <span>{item.label}</span>
                  {item.badge && unread > 0 ? <span className="count">{unread > 99 ? '99+' : unread}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <div className="sidebar__user">
            <span className="avatar">{user?.initials || ''}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>{user?.fullName}</b>
              <span>{roleLabel(user?.role)}</span>
            </div>
            <button type="button" className="icon-btn" style={{ color: 'rgba(255,255,255,.75)' }} onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={19} />
            </button>
          </div>
          <p className="tiny" style={{ color: 'rgba(255,255,255,.4)', margin: '.6rem .4rem 0', lineHeight: 1.4 }}>
            Your session is stored securely on the office server.
          </p>
        </div>
      </aside>

      {open ? <button type="button" className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn hide-desktop" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <div className="topbar__title">
            <h1>{title}</h1>
            <p>{roleLabel(user?.role)} workspace</p>
          </div>
          <div className="topbar__actions">
            <Link to={notificationsPath} className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
              <Icon name="bell" size={21} />
              {unread > 0 ? <span className="icon-btn__dot">{unread > 99 ? '99+' : unread}</span> : null}
            </Link>
            <Link to={profilePath} className="icon-btn" aria-label="Open my profile" title={user?.fullName}>
              <span className="avatar avatar--sm">{user?.initials}</span>
            </Link>
          </div>
        </header>

        <main className="content">
          {user?.mustChangePassword && location.pathname !== profilePath ? (
            <div className="notice-warning mb-2">
              <Icon name="alert" size={18} />
              <div>
                <strong>Please change your temporary password.</strong>{' '}
                <Link to={profilePath}>Open your profile</Link> to choose a new one.
              </div>
            </div>
          ) : null}
          <Outlet />
        </main>

        <nav className="bottom-nav" aria-label="Quick navigation">
          {bottom.map((item) =>
            item.more ? (
              <button key="more" type="button" className="bottom-nav__item" onClick={() => setOpen(true)} style={{ background: 'none', border: 0 }}>
                <Icon name="more" size={22} />
                <span>{item.label}</span>
              </button>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn('bottom-nav__item', isActive && 'active')}>
                <Icon name={item.icon} size={22} />
                <span>{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>
      </div>
    </div>
  );
}
