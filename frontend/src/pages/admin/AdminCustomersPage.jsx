import { useState } from 'react';
import { api, formatCurrency, formatDateParts, formatTime } from '../../api/client.js';
import { useAsync, useDebouncedValue } from '../../hooks/useAsync.js';
import Modal from '../../components/Modal.jsx';
import { ErrorState, Loading, StatusBadge } from '../../components/ui.jsx';

export default function AdminCustomersPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const debounced = useDebouncedValue(search, 300);

  const list = useAsync(
    (signal) => api.admin.customers({ search: debounced || undefined, limit: 50 }, { signal }),
    [debounced],
  );
  const profile = useAsync(
    (signal) => (selected ? api.admin.customer(selected.id, { signal }) : Promise.resolve(null)),
    [selected?.id],
    { enabled: Boolean(selected) },
  );

  const meta = list.data?.meta;

  return (
    <div className="stack gap-18">
      <div>
        <p className="eyebrow">People</p>
        <h1 style={{ marginTop: 6 }}>Customers</h1>
        <p className="muted small">
          Guest checkouts create a customer row automatically, so this list includes everyone who has ever
          booked — with their lifetime spend.
        </p>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search by name, e-mail or phone…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search customers"
        />
      </div>

      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? <Loading label="Loading customers…" /> : null}

      {list.data ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Bookings</th>
                <th>Seats</th>
                <th>Lifetime spend</th>
                <th>Last booking</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="row gap-12">
                      <span className="avatar">{String(customer.fullName).slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{customer.fullName}</strong>
                        <div className="tiny dim">{customer.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono tiny">{customer.phone}</td>
                  <td>
                    <span className={`badge ${customer.role === 'admin' ? 'badge-warn' : ''}`}>{customer.role}</span>
                  </td>
                  <td className="num">{customer.bookingCount}</td>
                  <td className="num">{customer.seatsBooked}</td>
                  <td className="num"><strong>{formatCurrency(customer.totalSpend)}</strong></td>
                  <td className="tiny dim">
                    {customer.lastBookingAt ? new Date(customer.lastBookingAt).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setSelected(customer)}>
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.data.data.length ? (
                <tr><td colSpan="8" className="dim">No customers match that search.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {meta ? (
        <span className="tiny dim">{meta.total} customer{meta.total === 1 ? '' : 's'} in total</span>
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.fullName ?? 'Customer'}
        width={720}
      >
        {profile.loading && !profile.data ? <Loading label="Loading history…" /> : null}

        {profile.data?.data ? (
          <div className="stack gap-18">
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Bookings</div>
                <div className="stat-value">{profile.data.data.bookings.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">E-mail</div>
                <div className="small" style={{ marginTop: 8 }}>{profile.data.data.customer.email}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Phone</div>
                <div className="small" style={{ marginTop: 8 }}>{profile.data.data.customer.phone}</div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Movie</th>
                    <th>Show</th>
                    <th>Seats</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.data.data.bookings.map((booking) => (
                    <tr key={booking.booking_reference}>
                      <td className="mono">{booking.booking_reference}</td>
                      <td>{booking.movie_title}</td>
                      <td className="tiny">
                        {booking.theatre_name}
                        <div className="dim">
                          {formatDateParts(booking.show_date).dayOfMonth}
                          {' '}{formatDateParts(booking.show_date).month} · {formatTime(booking.start_time)}
                        </div>
                      </td>
                      <td className="num">{booking.seat_count}</td>
                      <td className="num">{formatCurrency(booking.total_amount)}</td>
                      <td><StatusBadge status={booking.status} /></td>
                    </tr>
                  ))}
                  {!profile.data.data.bookings.length ? (
                    <tr><td colSpan="6" className="dim">This customer has not booked anything yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
