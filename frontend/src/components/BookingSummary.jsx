import { formatCurrency, formatTime } from '../api/client.js';

/**
 * Sticky booking summary.
 *
 * Shows the running total for the current selection. The amounts displayed here
 * are recomputed by the server when the booking is created; whatever the API
 * returns is what the user is charged (see CheckoutPage).
 */
export default function BookingSummary({
  movieTitle,
  posterUrl,
  theatreName,
  screenName,
  showDateLabel,
  startTime,
  seats = [],
  convenienceFeePercent = 5,
  maxSeats = 10,
  onRemove,
  children,
  footer,
  totalOverride,
}) {
  const subtotal = seats.reduce((sum, seat) => sum + (Number(seat.price) || 0), 0);
  const fee = Math.round(subtotal * convenienceFeePercent) / 100;
  const total = totalOverride ?? subtotal + fee;

  return (
    <aside className="summary-panel">
      <div className="summary-head">
        <div className="row gap-12">
          {posterUrl ? (
            <img src={posterUrl} alt="" width="46" height="69" style={{ borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
          ) : null}
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow">Booking summary</p>
            <h3 style={{ marginTop: 4 }}>{movieTitle ?? 'Your booking'}</h3>
          </div>
        </div>
      </div>

      <div className="summary-body">
        <div className="stack gap-8">
          {theatreName ? (
            <div className="summary-row">
              <span>Theatre</span>
              <strong style={{ textAlign: 'right' }}>{theatreName}</strong>
            </div>
          ) : null}
          {screenName ? (
            <div className="summary-row">
              <span>Screen</span>
              <strong>{screenName}</strong>
            </div>
          ) : null}
          {showDateLabel ? (
            <div className="summary-row">
              <span>Date</span>
              <strong>{showDateLabel}</strong>
            </div>
          ) : null}
          {startTime ? (
            <div className="summary-row">
              <span>Time</span>
              <strong>{formatTime(startTime)}</strong>
            </div>
          ) : null}
        </div>

        <hr className="divider" style={{ margin: '4px 0' }} />

        <div>
          <div className="row between gap-8" style={{ marginBottom: 9 }}>
            <span className="eyebrow">Seats</span>
            <span className="tiny dim">
              {seats.length}/{maxSeats}
            </span>
          </div>
          {seats.length ? (
            <div className="seat-chips">
              {seats.map((seat) => (
                <button
                  key={seat.id}
                  type="button"
                  className="seat-chip"
                  onClick={() => onRemove?.(seat)}
                  title={onRemove ? `Remove ${seat.label}` : seat.label}
                  style={{ cursor: onRemove ? 'pointer' : 'default' }}
                >
                  {seat.label}
                  {onRemove ? <span aria-hidden="true" style={{ marginLeft: 5, opacity: 0.75 }}>✕</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="small dim">No seats selected yet.</p>
          )}
        </div>

        {children}

        <hr className="divider" style={{ margin: '4px 0' }} />

        <div className="stack gap-8">
          <div className="summary-row">
            <span>Tickets ({seats.length})</span>
            <strong className="num">{formatCurrency(subtotal)}</strong>
          </div>
          <div className="summary-row">
            <span>Convenience fee ({convenienceFeePercent}%)</span>
            <strong className="num">{formatCurrency(fee)}</strong>
          </div>
        </div>

        <div className="summary-total">
          <span>Total</span>
          <span className="num gradient-text">{formatCurrency(total)}</span>
        </div>

        {footer}
      </div>
    </aside>
  );
}
