import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatCurrency, formatDateParts, formatTime } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useBooking } from '../context/BookingContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import SeatMap from '../components/SeatMap.jsx';
import BookingSummary from '../components/BookingSummary.jsx';
import { ErrorState, Loading, StepBar } from '../components/ui.jsx';

/** Re-read the hall every 45s so a seat taken elsewhere does not surprise anyone. */
const REFRESH_MS = 45_000;

export default function SeatSelectionPage() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { selection, startShow, setSeats } = useBooking();
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const seatMap = useAsync((signal) => api.seatMap(showId, { signal }), [showId]);

  const data = seatMap.data?.data;
  const rules = data?.rules ?? { maxSeats: 10 };
  const show = data?.show;

  // Mark the active show (clears seats if the user switched screenings/date).
  useEffect(() => {
    if (show) {
      startShow({
        id: Number(showId),
        movieTitle: show.movie?.title,
        theatreName: show.theatre?.name,
        showDate: show.showDate,
        startTime: show.startTime,
      });
    }
  }, [show, showId, startShow]);

  // Keep the local selection in sync with the context when arriving fresh.
  useEffect(() => {
    if (selection.showId === Number(showId) && selection.seats.length && selectedIds.size === 0) {
      setSelectedIds(new Set(selection.seats.map((seat) => seat.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.showId, showId]);

  /**
   * Re-read availability and drop any seat that was taken in the meantime.
   * Called on an interval and whenever the tab regains focus.
   *
   * State is computed before calling any setter: mutating one component's state
   * from inside another setter's updater would be a render-phase update.
   */
  const resync = useCallback(async () => {
    const fresh = await seatMap.reload();
    const freshMap = fresh?.data;
    if (!freshMap) return;

    setSelectedIds((current) => {
      if (!current.size) return current;
      const statusById = new Map(
        freshMap.rows.flatMap((row) => row.seats).map((seat) => [seat.id, seat.status]),
      );
      const lost = [];
      const next = new Set();
      for (const id of current) {
        if (statusById.get(id) === 'AVAILABLE') next.add(id);
        else {
          const seat = selection.seats.find((item) => item.id === id);
          lost.push(seat?.label ?? `#${id}`);
        }
      }
      return next;
    });

    // Drop holds on seats that disappeared while we were looking at them.
    const stillAvailable = new Set(
      freshMap.rows.flatMap((row) => row.seats)
        .filter((seat) => seat.status === 'AVAILABLE')
        .map((seat) => seat.id),
    );
    const kept = selection.seats.filter((seat) => stillAvailable.has(seat.id));
    if (kept.length !== selection.seats.length) {
      const lostLabels = selection.seats
        .filter((seat) => !stillAvailable.has(seat.id))
        .map((seat) => seat.label);
      setSeats(kept);
      pushToast({
        tone: 'error',
        title: 'Seats no longer available',
        body: `${lostLabels.join(', ')} ${lostLabels.length > 1 ? 'were' : 'was'} just taken. Please pick another seat.`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatMap.reload, selection.seats, setSeats, pushToast]);

  useEffect(() => {
    if (!data) return undefined;
    const timer = window.setInterval(() => { resync(); }, REFRESH_MS);
    const onFocus = () => resync();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);

  const seatsById = useMemo(() => {
    const map = new Map();
    for (const row of data?.rows ?? []) {
      for (const seat of row.seats) map.set(seat.id, { ...seat, categoryLabel: row.categoryLabel });
    }
    return map;
  }, [data]);

  const selectedSeats = useMemo(
    () => [...selectedIds].map((id) => seatsById.get(id)).filter(Boolean),
    [selectedIds, seatsById],
  );

  /** Apply a new selection to both this page and the shared booking context. */
  const applySelection = (next) => {
    setSelectedIds(next);
    setSeats([...next].map((id) => seatsById.get(id)).filter(Boolean));
  };

  const toggleSeat = (seat) => {
    if (seat.status !== 'AVAILABLE') return;
    const next = new Set(selectedIds);
    if (next.has(seat.id)) {
      next.delete(seat.id);
    } else {
      if (next.size >= rules.maxSeats) {
        pushToast({
          tone: 'info',
          title: `Up to ${rules.maxSeats} seats per booking`,
          body: 'Deselect a seat to choose a different one.',
        });
        return;
      }
      next.add(seat.id);
    }
    applySelection(next);
  };

  const removeSeat = (seat) => {
    const next = new Set(selectedIds);
    next.delete(seat.id);
    applySelection(next);
  };

  const proceed = () => {
    if (!selectedSeats.length) return;
    const ids = selectedSeats.map((seat) => seat.id).join(',');
    navigate(`/checkout?showId=${showId}&seats=${ids}`);
  };

  if (seatMap.loading && !data) return <div className="shell"><Loading label="Loading seat map…" /></div>;
  if (seatMap.error && !data) {
    return (
      <div className="shell page" style={{ paddingTop: 40 }}>
        <ErrorState error={seatMap.error} onRetry={seatMap.reload} />
        <div style={{ marginTop: 18 }}>
          <Link to="/" className="btn btn-outline">← Back to home</Link>
        </div>
      </div>
    );
  }

  const dateLabel = show?.showDate ? formatDateParts(show.showDate).full : '';

  return (
    <div className="page">
      <div className="shell" style={{ paddingTop: 26 }}>
        <StepBar steps={['Choose movie', 'Theatre & show', 'Seats', 'Payment']} current={2} />

        <div className="section-head">
          <div>
            <nav className="breadcrumbs">
              <Link to="/">Home</Link>
              <span aria-hidden="true">›</span>
              <span>{show?.movie?.title}</span>
              <span aria-hidden="true">›</span>
              <span>Select seats</span>
            </nav>
            <h1>Choose your seats</h1>
            <p>
              {show?.theatre?.name} · {dateLabel} · {formatTime(show?.startTime)} ·{' '}
              {show?.screen?.name} ({String(show?.screen?.screenType ?? '').replace('_', ' ')})
            </p>
          </div>
          <div className="row gap-8 wrap">
            <span className="badge badge-live">{data.summary.available} available</span>
            <span className="badge">{data.summary.booked} occupied</span>
            {data.summary.blocked ? <span className="badge">{data.summary.blocked} not for sale</span> : null}
          </div>
        </div>

        {show?.isPast ? (
          <div className="alert alert-error" style={{ marginBottom: 18 }}>
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>This screening has already started</strong>
              <div className="small">Booking is closed for this show. Pick another screening to continue.</div>
            </div>
          </div>
        ) : null}

        <div className="booking-grid">
          <div>
            <SeatMap
              rows={data.rows}
              categories={data.categories}
              screenName={show?.screen?.name}
              screenType={show?.screen?.screenType}
              selectedIds={selectedIds}
              onToggle={toggleSeat}
              disabled={show?.isPast}
            />
          </div>

          <BookingSummary
            movieTitle={show?.movie?.title}
            posterUrl={undefined}
            theatreName={show?.theatre?.name}
            screenName={show?.screen?.name}
            showDateLabel={dateLabel}
            startTime={show?.startTime}
            seats={selectedSeats}
            convenienceFeePercent={data.pricing.convenienceFeePercent}
            maxSeats={data.pricing.maxSeatsPerBooking}
            onRemove={removeSeat}
            footer={
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  disabled={!selectedSeats.length || show?.isPast}
                  onClick={proceed}
                >
                  {selectedSeats.length
                    ? `Continue · ${formatCurrency(selectedSeats.reduce((sum, seat) => sum + seat.price, 0))}`
                    : 'Select seats to continue'}
                </button>
                <p className="tiny dim center" style={{ marginTop: 10 }}>
                  Seats are held for {data.rules.holdMinutes} minutes after you continue.
                  <br />
                  Nothing is charged until you confirm payment.
                </p>
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
