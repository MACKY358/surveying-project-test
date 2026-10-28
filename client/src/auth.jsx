import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from './api';
import { homeFor } from './utils';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [csrfToken, setCsrfToken] = useState(null);
  const [unread, setUnread] = useState(0);
  const [bootError, setBootError] = useState(null);

  const refresh = useCallback(async () => {
    const data = await api.get('/auth/me');
    setUser(data.user || null);
    setCsrfToken(data.csrfToken || null);
    setUnread(Number(data.unreadNotifications || 0));
    setBootError(null);
    return data.user;
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get('/auth/me')
      .then((data) => {
        if (!alive) return;
        setUser(data.user || null);
        setCsrfToken(data.csrfToken || null);
        setUnread(Number(data.unreadNotifications || 0));
      })
      .catch((err) => {
        if (!alive) return;
        setUser(null);
        setBootError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setUnread(0);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setUser(data.user);
    setCsrfToken(data.csrfToken || null);
    const me = await api.get('/auth/me').catch(() => null);
    if (me) setUnread(Number(me.unreadNotifications || 0));
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload);
    setUser(data.user);
    setCsrfToken(data.csrfToken || null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      /* the session may already be gone */
    }
    setUser(null);
    setUnread(0);
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const data = await api.get('/notifications', { unread: 1, pageSize: 1 });
      setUnread(Number(data.unread || 0));
      return Number(data.unread || 0);
    } catch (err) {
      return unread;
    }
  }, [unread]);

  const value = useMemo(
    () => ({
      user,
      loading: user === undefined,
      bootError,
      csrfToken,
      unread,
      setUnread,
      refreshUnread,
      login,
      register,
      logout,
      refresh,
    }),
    [user, bootError, csrfToken, unread, refreshUnread, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function FullScreenLoader({ label = 'Loading your workspace…' }) {
  return (
    <div className="auth-wrap" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <div className="loading-block">
        <div className="logo__mark" style={{ width: 52, height: 52 }}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" strokeWidth="1.7">
            <circle cx="12" cy="12" r="9" />
            <path d="m15.5 8.5-2.1 5-5 2.1 2.1-5z" fill="#fff" stroke="none" />
          </svg>
        </div>
        <div className="spinner" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Route guard: authentication + optional role allow-list. */
export function RequireAuth({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return <Outlet />;
}

/** Signed-in users should not see the login/registration screens. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader label="Checking your session…" />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
