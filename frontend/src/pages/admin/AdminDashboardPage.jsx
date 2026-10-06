import { Link } from 'react-router-dom';
import { api, formatCurrency, formatDateParts, formatTime } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { ErrorState, Loading, StatusBadge } from '../../components/ui.jsx';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data, loading, error, reload } = useAsync((signal) => api.admin.stats({ signal }), []);
  const stats = data?.data;

  if (loading && !stats) return <Loading label="Loading dashboard…" />;
  if (error && !stats) return <ErrorState error={error} onRetry={reload} />;

  const maxRevenue = Math.max(1, ...stats.revenueByDay.map((row) => Number(row.revenue) || 0));

  return (
    <div className="stack gap-20">
      <div className="row between wrap gap-12">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 style={{ marginTop: 6 }}>Dashboard</h1>
          <p className="muted small">Live figures read straight from MySQL — no cached numbers.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={reload} disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↻'} Refresh
        </button>
      </div>

      {/* ------------------------------------------------------------ headline */}
      <div className="stat-grid">
        <StatCard
          label="Gross revenue"
          value={formatCurrency(stats.bookings.gross_revenue)}
          sub={`${formatCurrency(stats.today.revenue_today)} collected today`}
        />
        <StatCard
          label="Tickets sold"
          value={stats.bookings.tickets_sold.toLocaleString('en-IN')}
          sub={`${stats.bookings.confirmed} confirmed bookings`}
        />
        <StatCard
          label="Shows today"
          value={stats.today.shows_today}
          sub={`${stats.today.bookings_today} bookings placed today`}
        />
        <StatCard
          label="Seat holds live"
          value={stats.bookings.pending}
          sub="PENDING bookings holding seats"
        />
      </div>

      <div className="stat-grid">
        <StatCard label="Movies" value={stats.totals.movies} sub={`${stats.totals.now_showing} showing · ${stats.totals.upcoming} upcoming`} />
        <StatCard label="Theatres" value={stats.totals.theatres} sub={`${stats.totals.screens} active screens`} />
        <StatCard label="Seats" value={stats.totals.seats.toLocaleString('en-IN')} sub="physical seats in the system" />
        <StatCard label="Customers" value={stats.totals.customers} sub="registered + guest checkouts" />
      </div>

      <div className="admin-cards">
        {/* --------------------------------------------------------- revenue */}
        <section className="panel">
          <header className="panel-head">
            <h3>Revenue · last 7 days</h3>
            <span className="tiny dim">Confirmed bookings only</span>
          </header>
          <div className="panel-body">
            {stats.revenueByDay.length ? (
              <div className="mini-chart">
                {stats.revenueByDay.map((row) => (
                  <div key={String(row.day)} className="mini-chart-col" title={`${formatCurrency(row.revenue)} · ${row.bookings} bookings`}>
                    <span className="tiny num dim">{Math.round(Number(row.revenue) / 1000)}k</span>
                    <div
                      className="mini-chart-bar"
                      style={{ height: `${Math.max(4, (Number(row.revenue) / maxRevenue) * 100)}%` }}
                    />
                    <span className="mini-chart-label">
                      {formatDateParts(String(row.day).slice(0, 10)).dayOfMonth}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No confirmed bookings in the last 7 days.</p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- top movies */}
        <section className="panel">
          <header className="panel-head">
            <h3>Top movies by revenue</h3>
            <Link to="/admin/movies" className="btn btn-sm btn-ghost">Manage →</Link>
          </header>
          <div className="panel-body">
            {stats.topMovies.length ? (
              <div className="row-list">
                {stats.topMovies.map((movie) => (
                  <div key={movie.id} className="row-item">
                    <img src={movie.poster_url} alt="" width="38" height="57" style={{ borderRadius: 7, objectFit: 'cover' }} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small" style={{ fontWeight: 650 }}>{movie.title}</div>
                      <div className="tiny dim">
                        {movie.booking_count} bookings · {movie.seats_sold} seats
                      </div>
                    </div>
                    <strong className="num">{formatCurrency(movie.revenue)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No bookings yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* -------------------------------------------------------- occupancy */}
      <section className="panel">
        <header className="panel-head">
          <h3>Today&apos;s screenings by occupancy</h3>
          <span className="tiny dim">From the vw_show_occupancy database view</span>
        </header>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Movie</th>
                <th>Theatre</th>
                <th>Screen</th>
                <th>Time</th>
                <th>Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {stats.occupancyToday.map((row) => (
                <tr key={`${row.movie_title}-${row.theatre_name}-${row.start_time}`}>
                  <td><strong>{row.movie_title}</strong></td>
                  <td>{row.theatre_name}</td>
                  <td>{row.screen_name}</td>
                  <td className="mono">{formatTime(row.start_time)}</td>
                  <td>
                    <div className="row gap-12">
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.min(100, row.occupancy_percent)}%` }} />
                      </div>
                      <span className="tiny dim nowrap">
                        {row.booked_seats}/{row.total_seats} · {row.occupancy_percent}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {!stats.occupancyToday.length ? (
                <tr><td colSpan="5" className="dim">No screenings today.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* --------------------------------------------------------- bookings */}
      <section className="panel">
        <header className="panel-head">
          <h3>Latest bookings</h3>
          <Link to="/admin/bookings" className="btn btn-sm btn-ghost">All bookings →</Link>
        </header>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Movie &amp; show</th>
                <th>Seats</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentBookings.map((booking) => (
                <tr key={booking.booking_reference}>
                  <td className="mono">{booking.booking_reference}</td>
                  <td><strong>{booking.customer_name}</strong></td>
                  <td>
                    <div className="small">{booking.movie_title}</div>
                    <div className="tiny dim">
                      {booking.theatre_name} · {formatDateParts(booking.show_date).dayOfMonth}{' '}
                      {formatDateParts(booking.show_date).month} · {formatTime(booking.start_time)}
                    </div>
                  </td>
                  <td>{booking.seat_count}</td>
                  <td className="num">{formatCurrency(booking.total_amount)}</td>
                  <td><StatusBadge status={booking.status} /></td>
                </tr>
              ))}
              {!stats.recentBookings.length ? (
                <tr><td colSpan="6" className="dim">No bookings yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="tiny dim">
        Data generated live at {new Date(stats.generatedAt).toLocaleString('en-IN')}. Every figure above is a
        SQL aggregate over the bookings, booking_seats, payments and shows tables.
      </p>
    </div>
  );
}
