import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { adminToken, api } from '../api/client.js';

/**
 * Admin session.
 *
 * The JWT lives in localStorage and is only ever attached to /api/admin/* calls
 * by the API client. Every admin page is additionally guarded server-side by
 * `requireAdmin`, so hiding the UI is a convenience, never the security boundary.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Restore a session from a stored token on first load.
  useEffect(() => {
    let cancelled = false;
    const token = adminToken.get();
    if (!token) {
      setReady(true);
      return undefined;
    }
    api
      .me()
      .then((response) => {
        // A cancelled pass must never mutate shared state: under StrictMode the
        // first effect pass is torn down while this request is still in flight,
        // and clearing the token here would log the admin out for no reason.
        if (cancelled) return;
        if (response.data?.role === 'admin') setUser(response.data);
        else adminToken.clear();
      })
      .catch(() => {
        // Expired or invalid token: drop it rather than looping on 401s.
        if (!cancelled) adminToken.clear();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await api.login({ email, password });
    if (response.data?.user?.role !== 'admin') {
      throw new Error('This account is not an administrator.');
    }
    adminToken.set(response.data.token);
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const logout = useCallback(() => {
    adminToken.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, isAuthenticated: Boolean(user), login, logout }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export default AuthContext;
