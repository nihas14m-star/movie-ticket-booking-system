import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import TicketView from '../components/TicketView.jsx';
import { ErrorState, Loading, StepBar } from '../components/ui.jsx';

const CONFETTI_COLORS = ['#ff4d6d', '#ff9f43', '#7c5cff', '#38e1ff', '#34d399', '#f5a524'];

/** Lightweight CSS confetti — no dependency, runs once, respects reduced motion. */
function Confetti({ pieces = 70 }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        duration: 2.6 + Math.random() * 1.9,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 7,
      })),
    [pieces],
  );

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;

  return (
    <div className="confetti" aria-hidden="true">
      {items.map((item) => (
        <i
          key={item.id}
          style={{
            left: `${item.left}%`,
            background: item.color,
            width: item.size,
            height: item.size * 1.6,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function ConfirmationPage() {
  const { reference } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [celebrate, setCelebrate] = useState(params.get('celebrate') === '1');
  const [busy, setBusy] = useState(false);

  const booking = useAsync((signal) => api.booking(reference, { signal }), [reference]);
  const data = booking.data?.data;

  useEffect(() => {
    if (!celebrate) return undefined;
    const timer = window.setTimeout(() => setCelebrate(false), 4200);
    return () => window.clearTimeout(timer);
  }, [celebrate]);

  const cancel = async () => {
    if (busy || !data) return;
    if (!window.confirm('Cancel this booking? Seats are released immediately and the payment is refunded.')) return;
    setBusy(true);
    try {
      await api.cancelBooking(data.bookingReference, { reason: 'User cancelled from ticket' });
      pushToast({ tone: 'success', title: 'Booking cancelled', body: 'Your seats have been released.' });
      booking.reload();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Could not cancel', body: error.message });
    } finally {
      setBusy(false);
    }
  };

  if (booking.loading && !data) return <div className="shell"><Loading label="Fetching your ticket…" /></div>;
  if (booking.error && !data) {
    return (
      <div className="shell page" style={{ paddingTop: 40 }}>
        <ErrorState error={booking.error} onRetry={booking.reload} />
        <div className="row gap-12" style={{ marginTop: 18 }}>
          <Link to="/" className="btn btn-outline">← Home</Link>
          <Link to="/my-bookings" className="btn btn-ghost">Find my tickets</Link>
        </div>
      </div>
    );
  }

  const isConfirmed = data.status === 'CONFIRMED';

  return (
    <div className="page confirm-page">
      {celebrate && isConfirmed ? <Confetti /> : null}

      <div className="shell">
        <StepBar steps={['Choose movie', 'Theatre & show', 'Seats', 'Payment']} current={4} />

        {isConfirmed ? (
          <>
            <div className="confirm-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
            </div>
            <h1>Booking confirmed</h1>
            <p className="lead" style={{ marginTop: 10 }}>
              Your seats are locked in. Show the QR code at the entrance — it also works from your phone.
            </p>
          </>
        ) : data.status === 'PENDING' ? (
          <>
            <h1>Payment pending</h1>
            <p className="lead" style={{ marginTop: 10 }}>
              Your seats are held but not paid for yet. Complete the payment to confirm this booking.
            </p>
          </>
        ) : (
          <>
            <h1>{data.status === 'CANCELLED' ? 'Booking cancelled' : 'Booking expired'}</h1>
            <p className="lead" style={{ marginTop: 10 }}>
              This ticket is no longer valid. You can book again any time.
            </p>
          </>
        )}

        <div className="ticket-wrap" style={{ marginTop: 32 }}>
          <TicketView booking={data} />
        </div>

        <div className="confirm-actions">
          {data.status === 'PENDING' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/checkout?showId=${data.show?.id}&seats=${data.seats.map((seat) => seat.id).join(',')}`)}
            >
              Complete payment
            </button>
          ) : null}

          {isConfirmed ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                🖨️ Print ticket
              </button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={cancel}>
                Cancel booking
              </button>
            </>
          ) : null}

          <Link to="/" className="btn btn-ghost">Book another movie</Link>
        </div>

        <div className="card" style={{ maxWidth: 620, margin: '32px auto 0', textAlign: 'left' }}>
          <p className="eyebrow">Good to know</p>
          <ul className="stack gap-8" style={{ marginTop: 12 }}>
            <li className="row gap-8 small muted">
              <span aria-hidden="true">🎫</span> Carry the booking ID <strong className="mono">{data.bookingReference}</strong> — it is
              enough on its own if the QR cannot be scanned.
            </li>
            <li className="row gap-8 small muted">
              <span aria-hidden="true">🕒</span> Doors open 20 minutes before {data.show?.startTime?.slice(0, 5)}.
              Latecomers may be seated after the interval.
            </li>
            <li className="row gap-8 small muted">
              <span aria-hidden="true">↩️</span> Cancelling releases your seats instantly and refunds the demo payment.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
