import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatCurrency, formatDateParts, formatTime } from '../api/client.js';
import { StatusBadge } from './ui.jsx';

/**
 * Digital ticket.
 *
 * The QR encodes the booking reference plus show id — exactly what a gate
 * scanner would look up by. It is generated locally from the API payload, so
 * nothing extra leaves the browser.
 */
export default function TicketView({ booking }) {
  const [qr, setQr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(booking.qrPayload ?? booking.bookingReference, {
      margin: 1,
      width: 264,
      color: { dark: '#0b0e18', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => setQr(null));
    return () => {
      cancelled = true;
    };
  }, [booking.qrPayload, booking.bookingReference]);

  const dateLabel = booking.show?.showDate ? formatDateParts(booking.show.showDate).full : '';

  return (
    <article className="ticket">
      <header className="ticket-top">
        <div className="row between wrap gap-12">
          <div>
            <p className="eyebrow" style={{ color: 'rgba(255,255,255,.82)' }}>Cineverse e-ticket</p>
            <h2 style={{ color: '#fff', marginTop: 4 }}>{booking.movie?.title ?? 'Movie ticket'}</h2>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <div className="row gap-16 wrap" style={{ marginTop: 14 }}>
          <span className="small">
            <strong>{booking.seats.length}</strong> seat{booking.seats.length === 1 ? '' : 's'}
          </span>
          <span className="small">{booking.show?.screenName}</span>
          <span className="small">{booking.show?.city}</span>
        </div>
      </header>

      <div className="ticket-perforation" />

      <div className="ticket-body">
        <div>
          <div className="ticket-grid">
            <div className="ticket-field">
              <dt>Booking ID</dt>
              <dd className="ticket-code">{booking.bookingReference}</dd>
            </div>
            <div className="ticket-field">
              <dt>Theatre</dt>
              <dd>{booking.show?.theatreName}</dd>
            </div>
            <div className="ticket-field">
              <dt>Date</dt>
              <dd>{dateLabel}</dd>
            </div>
            <div className="ticket-field">
              <dt>Show time</dt>
              <dd>
                {formatTime(booking.show?.startTime)}
                <span className="dim small"> – {formatTime(booking.show?.endTime)}</span>
              </dd>
            </div>
            <div className="ticket-field">
              <dt>Seats</dt>
              <dd className="mono">{booking.seats.map((seat) => seat.label).join(', ') || '—'}</dd>
            </div>
            <div className="ticket-field">
              <dt>Guest</dt>
              <dd>{booking.customer.name}</dd>
            </div>
          </div>

          <hr className="divider" />

          <div className="stack gap-8">
            <div className="summary-row">
              <span>Tickets ({booking.seatCount})</span>
              <strong className="num">{formatCurrency(booking.subtotal)}</strong>
            </div>
            <div className="summary-row">
              <span>Convenience fee</span>
              <strong className="num">{formatCurrency(booking.convenienceFee)}</strong>
            </div>
            <div className="summary-row" style={{ fontSize: '1.05rem' }}>
              <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>Total paid</span>
              <strong className="num" style={{ color: 'var(--success)', fontWeight: 780 }}>
                {formatCurrency(booking.totalAmount)}
              </strong>
            </div>
          </div>

          {booking.payment ? (
            <p className="tiny dim" style={{ marginTop: 12 }}>
              {booking.payment.method} · {booking.payment.status} · ref {booking.payment.reference}
              {booking.payment.message ? ` · ${booking.payment.message}` : ''}
            </p>
          ) : null}
        </div>

        <figure className="ticket-qr">
          {qr ? (
            <img src={qr} alt={`QR code for booking ${booking.bookingReference}`} />
          ) : (
            <div className="skeleton" style={{ width: 132, height: 132 }} />
          )}
          <figcaption>SCAN AT ENTRANCE</figcaption>
        </figure>
      </div>
    </article>
  );
}
