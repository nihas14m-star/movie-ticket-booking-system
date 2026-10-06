import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCurrency, formatDateParts, formatTime } from '../../api/client.js';
import { useAsync, useDebouncedValue } from '../../hooks/useAsync.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ErrorState, Loading, StatusBadge } from '../../components/ui.jsx';

export default function AdminBookingsPage() {
  const { pushToast } = useToast();
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const list = useAsync(
    (signal) => api.admin.bookings({
      status: status || undefined,
      date: date || undefined,
      search: debounced || undefined,
      page,
      limit: 25,
    }, { signal }),
    [status, date, debounced, page],
  );

  const cancel = async (booking) => {
    if (!window.confirm(`Cancel ${booking.bookingReference}? Seats are released and the payment refunded.`)) return;
    try {
      await api.cancelBooking(booking.bookingReference, { reason: 'Cancelled by admin' });
      pushToast({ tone: 'success', title: 'Booking cancelled', body: booking.bookingReference });
      list.reload();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Could not cancel', body: error.message });
    }
  };

  const meta = list.data?.meta;

  return (
    <div className="stack gap-18">
      <div>
        <p className="eyebrow">Sales</p>
        <h1 style={{ marginTop: 6 }}>Bookings</h1>
        <p className="muted small">
          Every booking across every screening, with its seats, payment method and status.
        </p>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search reference, name or e-mail…"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          aria-label="Search bookings"
        />
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING">Pending (seats held)</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <input
          type="date"
          className="input"
          style={{ width: 'auto' }}
          value={date}
          onChange={(event) => { setDate(event.target.value); setPage(1); }}
          aria-label="Filter by show date"
        />
      </div>

      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? <Loading label="Loading bookings…" /> : null}

      {list.data ? (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Movie &amp; show</th>
                  <th>Seats</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <Link to={`/ticket/${booking.bookingReference}`} className="mono" style={{ color: 'var(--accent-2)' }}>
                        {booking.bookingReference}
                      </Link>
                      <div className="tiny dim">{new Date(booking.createdAt).toLocaleString('en-IN')}</div>
                    </td>
                    <td>
                      <strong>{booking.customer.name}</strong>
                      <div className="tiny dim">{booking.customer.email}</div>
                      <div className="tiny dim">{booking.customer.phone}</div>
                    </td>
                    <td>
                      <div className="small">{booking.movie.title}</div>
                      <div className="tiny dim">
                        {booking.show.theatreName} · {booking.show.screenName}
                      </div>
                      <div className="tiny dim">
                        {formatDateParts(booking.show.showDate).full} · {formatTime(booking.show.startTime)}
                      </div>
                    </td>
                    <td>
                      <div className="mono tiny">{booking.seatLabels ?? '—'}</div>
                      <div className="tiny dim">{booking.seatCount} seat(s)</div>
                    </td>
                    <td className="num">
                      <strong>{formatCurrency(booking.totalAmount)}</strong>
                      <div className="tiny dim">
                        {formatCurrency(booking.subtotal)} + {formatCurrency(booking.convenienceFee)} fee
                      </div>
                    </td>
                    <td>
                      {booking.payment.method ? (
                        <>
                          <div className="small">{booking.payment.method}</div>
                          <StatusBadge status={booking.payment.status} />
                        </>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td><StatusBadge status={booking.status} /></td>
                    <td>
                      <div className="cell-actions">
                        <Link to={`/ticket/${booking.bookingReference}`} className="btn btn-sm btn-ghost">Ticket</Link>
                        {booking.status === 'CONFIRMED' || booking.status === 'PENDING' ? (
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => cancel(booking)}>Cancel</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!list.data.data.length ? (
                  <tr><td colSpan="8" className="dim">No bookings match these filters.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="row between wrap gap-12">
            <span className="tiny dim">
              Page {meta.page} of {meta.totalPages} · {meta.total} booking{meta.total === 1 ? '' : 's'}
            </span>
            <div className="row gap-8">
              <button type="button" className="btn btn-sm btn-outline" disabled={page <= 1 || list.loading} onClick={() => setPage((value) => value - 1)}>
                ← Previous
              </button>
              <button type="button" className="btn btn-sm btn-outline" disabled={page >= meta.totalPages || list.loading} onClick={() => setPage((value) => value + 1)}>
                Next →
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
