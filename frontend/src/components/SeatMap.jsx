import { formatCurrency } from '../api/client.js';

/**
 * Interactive hall layout.
 *
 * Seat state comes straight from the API (`AVAILABLE` | `BOOKED` | `BLOCKED`) —
 * occupied seats are real booking rows in MySQL, blocked seats are seats with
 * `is_active = 0`. Nothing on this screen is decorative.
 */
export default function SeatMap({ rows = [], categories = [], screenName, screenType, selectedIds, onToggle, disabled }) {
  return (
    <div>
      <div className="seat-legend" style={{ marginBottom: 22 }}>
        <span className="legend-item">
          <span className="legend-swatch is-available" /> Available
        </span>
        <span className="legend-item">
          <span className="legend-swatch is-selected" /> Selected
        </span>
        <span className="legend-item">
          <span className="legend-swatch is-booked" /> Occupied
        </span>
        <span className="legend-item">
          <span className="legend-swatch is-blocked" /> Not for sale
        </span>
        <span className="grow" />
        <span className="tiny dim">Tap a seat to select · tap again to deselect</span>
      </div>

      <div className="seat-layout">
        <div className="seat-screen">
          <div className="seat-screen-bar" />
          <span>{screenName ? `${screenName} · ${String(screenType).replace('_', ' ')} — screen this way` : 'Screen'}</span>
        </div>

        {rows.map((row) => (
          <div key={row.rowLabel} className="seat-row">
            <span className="seat-row-label" aria-hidden="true">{row.rowLabel}</span>
            {row.seats.map((seat) => {
              const selected = selectedIds.has(seat.id);
              const statusClass =
                seat.status === 'BOOKED' ? 'is-booked' : seat.status === 'BLOCKED' ? 'is-blocked' : 'is-available';
              return (
                <button
                  key={seat.id}
                  type="button"
                  className={`seat ${statusClass} ${selected ? 'is-selected' : ''}`}
                  data-category={seat.categoryCode}
                  disabled={disabled || seat.status !== 'AVAILABLE'}
                  aria-pressed={selected}
                  aria-label={`Seat ${seat.label}, ${statusClass.replace('is-', '')}, ${formatCurrency(seat.price)}`}
                  title={`${seat.label} · ${row.categoryLabel} · ${formatCurrency(seat.price)}`}
                  onClick={() => onToggle?.(seat)}
                >
                  <span className="sr-only">{seat.label}</span>
                </button>
              );
            })}
            <span className="seat-row-label" aria-hidden="true">{row.rowLabel}</span>
          </div>
        ))}
      </div>

      <div className="card card-pad-sm" style={{ marginTop: 22 }}>
        <div className="row between wrap gap-16">
          <div>
            <p className="eyebrow">Seat categories</p>
            <div className="category-legend" style={{ marginTop: 10 }}>
              {categories.map((category) => (
                <div key={category.code} className="category-row">
                  <span className="category-dot" style={{ background: category.colorHex }} aria-hidden="true" />
                  <span style={{ fontWeight: 620 }}>{category.label}</span>
                  <span className="dim">·</span>
                  <span className="mono">{formatCurrency(category.price)}</span>
                  <span className="grow" />
                  <span className="tiny dim">
                    {category.seatCount} seat{category.seatCount === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="tiny dim" style={{ maxWidth: '30ch' }}>
            Prices shown already include this screening&apos;s demand multiplier. The exact amount is confirmed by the
            server when you reserve.
          </div>
        </div>
      </div>
    </div>
  );
}
