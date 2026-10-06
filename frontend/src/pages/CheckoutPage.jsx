import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatCurrency, formatDateParts, formatTime } from '../api/client.js';
import { useAsync, useCountdown } from '../hooks/useAsync.js';
import { useBooking } from '../context/BookingContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import BookingSummary from '../components/BookingSummary.jsx';
import { ErrorState, Field, Loading, StepBar } from '../components/ui.jsx';

const PAY_METHODS = [
  { id: 'UPI', label: 'UPI', hint: 'Pay by UPI id or QR', icon: '📱' },
  { id: 'CARD', label: 'Card', hint: 'Credit or debit card', icon: '💳' },
  { id: 'NETBANKING', label: 'Net banking', hint: 'All major banks', icon: '🏦' },
  { id: 'WALLET', label: 'Wallet', hint: 'Wallet balance', icon: '👛' },
];

const emptyForm = { name: '', email: '', phone: '' };
const emptyErrors = {};

/**
 * Booking summary → customer details → payment.
 *
 * Two server calls, in this order:
 *   1. POST /api/bookings        reserves the seats and returns the REAL amounts
 *   2. POST /api/bookings/:ref/pay  captures payment (demo gateway) and confirms
 *
 * Totals shown before step 2 come from the API response, never from the client,
 * so what the user pays is exactly what the database computed.
 */
export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { selection, clear } = useBooking();

  const showId = Number(params.get('showId'));
  const seatIds = useMemo(
    () => (params.get('seats') ?? '').split(',').map((value) => Number(value.trim())).filter(Number.isFinite),
    [params],
  );

  const [stage, setStage] = useState('details');
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState(emptyErrors);
  const [booking, setBooking] = useState(null);
  const [method, setMethod] = useState('UPI');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const seatMap = useAsync(
    (signal) => (showId ? api.seatMap(showId, { signal }) : Promise.resolve(null)),
    [showId],
  );

  const hold = useCountdown(booking?.expiresAt);

  // Pre-fill from the previous selection so the user does not retype anything.
  useEffect(() => {
    if (selection.seats.length && !form.name && selection.seats.length === seatIds.length) {
      setForm((current) => ({ ...current, name: current.name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = seatMap.data?.data;
  const show = data?.show;

  const selectedSeats = useMemo(() => {
    const map = new Map();
    for (const row of data?.rows ?? []) {
      for (const seat of row.seats) map.set(seat.id, { ...seat, categoryLabel: row.categoryLabel });
    }
    return seatIds.map((id) => map.get(id)).filter(Boolean);
  }, [data, seatIds]);

  const unavailable = selectedSeats.filter((seat) => seat.status !== 'AVAILABLE');

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = 'Enter a valid e-mail address';
    if (!/^[0-9+\-\s()]{8,20}$/.test(form.phone.trim())) next.phone = 'Enter a valid phone number';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const reserve = async (event) => {
    event.preventDefault();
    if (!validate() || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const response = await api.createBooking({
        showId,
        seatIds,
        customer: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        },
      });
      setBooking(response.data);
      setStage('payment');
      pushToast({
        tone: 'success',
        title: 'Seats held',
        body: `Seats reserved for ${response.meta?.holdMinutes ?? 10} minutes. Complete payment to confirm.`,
      });
    } catch (error) {
      setFailure(error);
      pushToast({ tone: 'error', title: 'Could not reserve those seats', body: error.message });
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!booking || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const response = await api.payBooking(booking.bookingReference, { method });
      clear();
      navigate(`/ticket/${response.data.bookingReference}?celebrate=1`, { replace: true });
    } catch (error) {
      setFailure(error);
      pushToast({ tone: 'error', title: 'Payment failed', body: error.message });
      // A declined payment keeps the booking PENDING; the hold is still valid.
      if (error.code === 'BOOKING_EXPIRED') {
        setStage('expired');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!showId || !seatIds.length) {
    return (
      <div className="shell page" style={{ paddingTop: 40 }}>
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🪑</div>
          <h3>No seats selected</h3>
          <p className="muted small" style={{ marginTop: 8 }}>
            Start by choosing a movie and a show time, then pick your seats.
          </p>
          <div style={{ marginTop: 18 }}>
            <Link to="/" className="btn btn-primary">Browse movies</Link>
          </div>
        </div>
      </div>
    );
  }

  if (seatMap.loading && !data) return <div className="shell"><Loading label="Preparing your bill…" /></div>;
  if (seatMap.error && !data) {
    return (
      <div className="shell page" style={{ paddingTop: 40 }}>
        <ErrorState error={seatMap.error} onRetry={seatMap.reload} />
      </div>
    );
  }

  const dateLabel = show?.showDate ? formatDateParts(show.showDate).full : '';
  const expired = stage === 'expired' || (booking && hold.expired && booking.status === 'PENDING');

  return (
    <div className="page">
      <div className="shell" style={{ paddingTop: 26 }}>
        <StepBar steps={['Choose movie', 'Theatre & show', 'Seats', 'Payment']} current={3} />

        <div className="section-head">
          <div>
            <nav className="breadcrumbs">
              <Link to="/">Home</Link>
              <span aria-hidden="true">›</span>
              <Link to={`/book/${showId}`}>Seats</Link>
              <span aria-hidden="true">›</span>
              <span>Checkout</span>
            </nav>
            <h1>Complete your booking</h1>
            <p>
              {show?.movie?.title} · {show?.theatre?.name} · {dateLabel} · {formatTime(show?.startTime)}
            </p>
          </div>
          {booking && !expired ? (
            <span className="badge badge-warn">
              <span className="countdown">
                ⏱ {String(hold.minutes).padStart(2, '0')}:{String(hold.seconds).padStart(2, '0')}
              </span>
              &nbsp;left on hold
            </span>
          ) : null}
        </div>

        {unavailable.length && stage === 'details' ? (
          <div className="alert alert-error" style={{ marginBottom: 18 }}>
            <span aria-hidden="true">⚠️</span>
            <div className="grow">
              <strong>
                {unavailable.map((seat) => seat.label).join(', ')} {unavailable.length > 1 ? 'are' : 'is'} no longer available
              </strong>
              <div className="small">Go back and choose different seats — nothing has been charged.</div>
              <div style={{ marginTop: 10 }}>
                <Link to={`/book/${showId}`} className="btn btn-sm btn-outline">← Pick other seats</Link>
              </div>
            </div>
          </div>
        ) : null}

        {failure && stage === 'payment' ? (
          <div className="alert alert-error" style={{ marginBottom: 18 }}>
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>{failure.message}</strong>
              {failure.code === 'PAYMENT_FAILED' ? (
                <div className="small">Your seats are still held — try another method.</div>
              ) : null}
            </div>
          </div>
        ) : null}

        {expired ? (
          <div className="alert alert-warn" style={{ marginBottom: 18 }}>
            <span aria-hidden="true">⏱</span>
            <div>
              <strong>Your seat hold expired</strong>
              <div className="small">
                The seats were released back to the hall. Nothing has been charged — pick your seats again to continue.
              </div>
              <div style={{ marginTop: 10 }}>
                <Link to={`/book/${showId}`} className="btn btn-sm btn-primary">Choose seats again</Link>
              </div>
            </div>
          </div>
        ) : null}

        <div className="checkout-grid">
          <div className="stack gap-20">
            {/* ----------------------------------------------- customer details */}
            <section className="card">
              <div className="row between wrap gap-12" style={{ marginBottom: 18 }}>
                <div>
                  <p className="eyebrow">Step 4a</p>
                  <h2 style={{ marginTop: 6 }}>Your details</h2>
                </div>
                {stage === 'payment' ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setStage('details')}
                    disabled={busy}
                  >
                    ✎ Edit
                  </button>
                ) : null}
              </div>

              {stage === 'details' ? (
                <form onSubmit={reserve} noValidate>
                  <div className="form-grid">
                    <Field label="Full name" htmlFor="name" error={errors.name} className="full">
                      <input
                        id="name"
                        className={`input ${errors.name ? 'input-error' : ''}`}
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder="Your full name"
                        autoComplete="name"
                        required
                      />
                    </Field>
                    <Field label="E-mail" htmlFor="email" error={errors.email} hint="Your ticket is sent here">
                      <input
                        id="email"
                        type="email"
                        className={`input ${errors.email ? 'input-error' : ''}`}
                        value={form.email}
                        onChange={(event) => setForm({ ...form, email: event.target.value })}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                      />
                    </Field>
                    <Field label="Mobile number" htmlFor="phone" error={errors.phone}>
                      <input
                        id="phone"
                        className={`input ${errors.phone ? 'input-error' : ''}`}
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                        placeholder="+91 98490 11001"
                        autoComplete="tel"
                        required
                      />
                    </Field>
                  </div>

                  <div className="row between wrap gap-12" style={{ marginTop: 22 }}>
                    <p className="tiny dim" style={{ maxWidth: '42ch' }}>
                      We only use these details for this ticket and to find your booking later. No account needed.
                    </p>
                    <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                      {busy ? <span className="spinner" style={{ width: 15, height: 15 }} /> : null}
                      {busy ? 'Reserving seats…' : 'Continue to payment'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="stack gap-12">
                  <div className="summary-row"><span>Name</span><strong>{booking.customer.name}</strong></div>
                  <div className="summary-row"><span>E-mail</span><strong>{booking.customer.email}</strong></div>
                  <div className="summary-row"><span>Mobile</span><strong>{booking.customer.phone}</strong></div>
                  <div className="summary-row">
                    <span>Booking reference</span>
                    <strong className="mono">{booking.bookingReference}</strong>
                  </div>
                </div>
              )}
            </section>

            {/* -------------------------------------------------------- payment */}
            {stage === 'payment' ? (
              <section className="card">
                <div className="row between wrap gap-12" style={{ marginBottom: 16 }}>
                  <div>
                    <p className="eyebrow">Step 4b</p>
                    <h2 style={{ marginTop: 6 }}>Payment method</h2>
                  </div>
                  <span className="badge badge-warn">Demo gateway</span>
                </div>

                <div className="pay-methods">
                  {PAY_METHODS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`pay-method ${method === option.id ? 'is-active' : ''}`}
                      onClick={() => setMethod(option.id)}
                      aria-pressed={method === option.id}
                    >
                      <span className="pay-method-icon" aria-hidden="true">{option.icon}</span>
                      <span>
                        <span style={{ display: 'block', fontWeight: 650 }}>{option.label}</span>
                        <span className="tiny dim">{option.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="alert alert-info" style={{ marginTop: 18 }}>
                  <span aria-hidden="true">ℹ️</span>
                  <div>
                    <strong>Simulated payment</strong>
                    <p className="small" style={{ marginTop: 3 }}>
                      No real payment is taken. The system records a real payment row and confirms the
                      booking in MySQL exactly as a live gateway integration would.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  style={{ marginTop: 18 }}
                  onClick={pay}
                  disabled={busy || expired}
                >
                  {busy ? <span className="spinner" style={{ width: 15, height: 15 }} /> : null}
                  {busy ? 'Processing payment…' : `Pay ${formatCurrency(booking.totalAmount)}`}
                </button>
              </section>
            ) : null}

            {/* ------------------------------------------------ how it works */}
            <section className="card">
              <p className="eyebrow">What happens next</p>
              <ul className="stack gap-8" style={{ marginTop: 12 }}>
                <li className="row gap-8 small muted">
                  <span aria-hidden="true">1️⃣</span> Seats are locked for you in the database for 10 minutes.
                </li>
                <li className="row gap-8 small muted">
                  <span aria-hidden="true">2️⃣</span> Paying confirms the booking and issues a booking ID.
                </li>
                <li className="row gap-8 small muted">
                  <span aria-hidden="true">3️⃣</span> Your QR ticket appears instantly and can be printed.
                </li>
              </ul>
            </section>
          </div>

          <BookingSummary
            movieTitle={show?.movie?.title}
            theatreName={show?.theatre?.name}
            screenName={show?.screen?.name}
            showDateLabel={dateLabel}
            startTime={show?.startTime}
            seats={selectedSeats}
            convenienceFeePercent={data.pricing.convenienceFeePercent}
            maxSeats={data.pricing.maxSeatsPerBooking}
            totalOverride={booking ? booking.totalAmount : undefined}
            footer={
              stage === 'details' ? (
                <Link to={`/book/${showId}`} className="btn btn-ghost btn-block btn-sm">
                  ← Change seats
                </Link>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
