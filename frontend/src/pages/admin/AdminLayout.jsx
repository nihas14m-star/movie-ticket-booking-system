import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Loading } from '../../components/ui.jsx';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/admin/movies', label: 'Movies', icon: '🎬' },
  { to: '/admin/theatres', label: 'Theatres & screens', icon: '🏛️' },
  { to: '/admin/shows', label: 'Shows', icon: '🗓️' },
  { to: '/admin/bookings', label: 'Bookings', icon: '🎟️' },
  { to: '/admin/customers', label: 'Customers', icon: '👥' },
];

/**
 * Admin shell: sidebar + content.
 *
 * The guard here is UX only — every request the pages make goes to /api/admin/*,
 * which the API refuses without a valid admin token.
 */
export default function AdminLayout() {
  const { isAuthenticated, ready, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!ready) {
    return <div className="shell"><Loading label="Checking your session…" /></div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="stack gap-8" style={{ padding: '4px 12px 16px' }}>
          <span className="eyebrow">Signed in as</span>
          <div className="row gap-8">
            <span className="avatar">{String(user?.name ?? 'A').slice(0, 2).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <div className="small" style={{ fontWeight: 650 }}>{user?.name}</div>
              <div className="tiny dim">{user?.email}</div>
            </div>
          </div>
        </div>

        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `admin-side-link ${isActive ? 'is-active' : ''}`}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        <div style={{ marginTop: 16, padding: '0 4px' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm btn-block"
            onClick={() => {
              logout();
              navigate('/admin/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}
