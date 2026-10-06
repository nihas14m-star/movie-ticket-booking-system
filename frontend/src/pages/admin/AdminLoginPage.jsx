import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Field } from '../../components/ui.jsx';

export default function AdminLoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('admin@cineverse.dev');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={location.state?.from ?? '/admin/dashboard'} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from ?? '/admin/dashboard', { replace: true });
    } catch (caught) {
      setError(caught.message ?? 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="stack gap-8" style={{ marginBottom: 22 }}>
          <span className="badge badge-warn" style={{ alignSelf: 'flex-start' }}>Administrator</span>
          <h1>Sign in to Cineverse</h1>
          <p className="muted small">
            The admin console manages the catalogue, theatres, screenings, bookings and customers.
          </p>
        </div>

        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            <span aria-hidden="true">⚠️</span>
            <div>{error}</div>
          </div>
        ) : null}

        <form onSubmit={submit} className="stack gap-16">
          <Field label="E-mail" htmlFor="adminEmail">
            <input
              id="adminEmail"
              type="email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </Field>

          <Field label="Password" htmlFor="adminPassword">
            <input
              id="adminPassword"
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <span className="spinner" style={{ width: 15, height: 15 }} /> : '🔐'}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="demo-credentials" style={{ marginTop: 22 }}>
          <strong>Demo credentials (seeded)</strong>
          <span>Admin: <code>admin@cineverse.dev</code> / <code>admin123</code></span>
          <span>Customer: <code>demo@cineverse.dev</code> / <code>password123</code></span>
          <span className="tiny" style={{ opacity: 0.8 }}>
            Customers do not need an account to book — this is only for the admin console.
          </span>
        </div>
      </section>
    </div>
  );
}
