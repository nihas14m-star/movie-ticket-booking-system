import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatCurrency, formatDateParts, formatTime } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { EmptyState, Field, StatusBadge } from '../components/ui.jsx';

/**
 * Ticket lookup.
 *
 * Two ways in: the booking reference (which is printed on the ticket) or the
 * e-mail address used at checkout. Both are answered by the API.
 */
export default function MyBookingsPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  const findByReference = async (event) => {
    event.preventDefault();
    const value = reference.trim();
    if (value.length < 6) {
      pushToast({ tone: 'error', title: 'Enter a full booking ID', body: 'It looks like CV-XXXX-XXXX.' });
      return;
    }
    setBusy(true);
    try {
      const response = await api.booking(value);
      navigate(`/ticket/${response.data.bookingReference}`);
    } catch (error) {
      pushToast({ tone: 'error', title: 'Booking not found', body: error.message });
    } finally {
      setBusy(false);
    }
  };

  const findByEmail = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.findBookings(email.trim());
      setResults(response.data);
      if (!response.data.length) {
        pushToast({ tone: 'info', title: 'No bookings found', body: 'Check the e-mail address you booked with.' });
      }
    } catch (error) {
      pushToast({ tone: 'error', title: 'Lookup failed', body: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="shell section">
        <div className="page-head">
          <p className="eyebrow">Your tickets</p>
          <h1 style={{ marginTop: 8 }}>Find my bookings</h1>
          <p className="lead" style={{ marginTop: 10, maxWidth: '62ch' }}>
            Enter the booking ID printed on your ticket, or the e-mail address you used at checkout, to see
            every booking you have made.
          </p>
        </div>

        <div className="admin-cards">
          <section className="card">
            <p className="eyebrow">Option 1</p>
            <h3 style={{ marginTop: 6, marginBottom: 14 }}>By booking ID</h3>
            <form onSubmit={findByReference} className="stack gap-14">
              <Field label="Booking ID" htmlFor="reference" hint="Format: CV-XXXX-XXXX">
                <input
                  id="reference"
                  className="input mono"
                  value={reference}
                  onChange={(event) => setReference(event.target.value.toUpperCase())}
                  placeholder="CV-7K4M-2QP9"
                  autoCapitalize="characters"
                />
              </Field>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <span className="spinner" style={{ width: 15, height: 15 }} /> : '🎫'}
                Open ticket
              </button>
            </form>
          </section>

          <section className="card">
            <p className="eyebrow">Option 2</p>
            <h3 style={{ marginTop: 6, marginBottom: 14 }}>By e-mail address</h3>
            <form onSubmit={findByEmail} className="stack gap-14">
              <Field label="E-mail used at checkout" htmlFor="lookupEmail">
                <input
                  id="lookupEmail"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>
              <button type="submit" className="btn btn-outline" disabled={busy || !email.trim()}>
                {busy ? <span className="spinner" style={{ width: 15, height: 15 }} /> : '🔍'}
                Search bookings
              </button>
            </form>
          </section>
        </div>

        {results ? (
          <section className="section" style={{ paddingBottom: 0 }}>
            <div className="section-head">
              <div>
                <h2>{results.length} booking{results.length === 1 ? '' : 's'} found</h2>
                <p>Tap a booking to open the ticket.</p>
              </div>
            </div>

            {results.length ? (
              <div className="booking-list">
                {results.map((booking) => (
                  <article key={booking.id} className="booking-row">
                    <img src={booking.movie?.posterUrl} alt="" loading="lazy" />
                    <div style={{ minWidth: 0 }}>
                      <div className="row gap-8 wrap" style={{ marginBottom: 6 }}>
                        <strong>{booking.movie?.title}</strong>
                        <StatusBadge status={booking.status} />
                      </div>
                      <p className="small muted">
                        {booking.show?.theatreName} · {booking.show?.screenName}
                      </p>
                      <p className="small muted">
                        {formatDateParts(booking.show?.showDate).full} · {formatTime(booking.show?.startTime)}
                      </p>
                      <p className="small" style={{ marginTop: 6 }}>
                        <span className="mono dim">{booking.bookingReference}</span>
                        <span className="dim"> · </span>
                        <span className="mono">{booking.seats.map((seat) => seat.label).join(', ')}</span>
                      </p>
                    </div>
                    <div className="booking-actions row gap-12">
                      <div className="stack" style={{ alignItems: 'flex-end' }}>
                        <strong className="num">{formatCurrency(booking.totalAmount)}</strong>
                        <span className="tiny dim">{booking.seatCount} seats</span>
                      </div>
                      <Link to={`/ticket/${booking.bookingReference}`} className="btn btn-sm btn-primary">
                        View ticket
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="🔍"
                title="No bookings under that e-mail"
                action={<Link to="/" className="btn btn-primary">Browse movies</Link>}
              >
                Double-check the address, or look up a specific booking with its booking ID.
              </EmptyState>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
