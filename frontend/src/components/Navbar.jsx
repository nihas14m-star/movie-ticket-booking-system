import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { useCity } from '../hooks/useCity.js';
import { useAsync } from '../hooks/useAsync.js';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/?view=now_showing', label: 'Now Showing' },
  { to: '/?view=upcoming', label: 'Coming Soon' },
  { to: '/my-bookings', label: 'My Tickets' },
];

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [city, setCity] = useCity();
  const location = useLocation();
  const { data: cities } = useAsync((signal) => api.cities({ signal }), []);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <header className="nav">
      <div className="shell nav-inner">
        <Link to="/" className="brand" onClick={closeDrawer}>
          <span className="brand-mark" aria-hidden="true">🎬</span>
          Cineverse
        </Link>

        <nav className="nav-links">
          {LINKS.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `nav-link ${isActive && location.search === '' ? 'is-active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="nav-right">
          <label className="nav-city">
            <span aria-hidden="true">📍</span>
            <select
              value={city}
              onChange={(event) => setCity(event.target.value)}
              aria-label="Choose your city"
            >
              <option value="">All cities</option>
              {(cities?.data ?? []).map((item) => (
                <option key={item.city} value={item.city}>
                  {item.city}
                </option>
              ))}
            </select>
          </label>

          <Link to="/admin" className="btn btn-sm btn-outline">Admin</Link>

          <button
            type="button"
            className="btn btn-icon btn-ghost nav-burger"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {drawerOpen ? (
        <div className="nav-drawer">
          {LINKS.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              end={link.end}
              className="nav-link"
              onClick={closeDrawer}
            >
              {link.label}
            </NavLink>
          ))}
          <label className="nav-city" style={{ display: 'flex', marginTop: 8 }}>
            <span aria-hidden="true">📍</span>
            <select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Choose your city">
              <option value="">All cities</option>
              {(cities?.data ?? []).map((item) => (
                <option key={item.city} value={item.city}>{item.city}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </header>
  );
}
