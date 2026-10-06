import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * The in-progress booking (seat selection).
 *
 * Kept in sessionStorage so a refresh — or a step back from checkout — does not
 * throw the selection away. The server re-validates everything at booking time,
 * so this is a convenience cache, never a source of truth.
 */
const BookingContext = createContext(null);
const STORAGE_KEY = 'cineverse.selection';

const emptySelection = { showId: null, seats: [], movieTitle: null, theatreName: null, showDate: null, startTime: null };

function readStored() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySelection;
    const parsed = JSON.parse(raw);
    return { ...emptySelection, ...parsed };
  } catch {
    return emptySelection;
  }
}

export function BookingProvider({ children }) {
  const [selection, setSelection] = useState(readStored);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      /* storage unavailable — selection just lives in memory for this tab */
    }
  }, [selection]);

  /** Start (or switch to) a show, clearing any previous seat choice. */
  const startShow = useCallback((show) => {
    setSelection((current) => {
      if (current.showId === show.id) return current;
      return {
        ...emptySelection,
        showId: show.id,
        movieTitle: show.movieTitle ?? null,
        theatreName: show.theatreName ?? null,
        showDate: show.showDate ?? null,
        startTime: show.startTime ?? null,
      };
    });
  }, []);

  const setSeats = useCallback((seats) => {
    setSelection((current) => ({ ...current, seats }));
  }, []);

  const toggleSeat = useCallback((seat) => {
    setSelection((current) => {
      const exists = current.seats.some((item) => item.id === seat.id);
      return {
        ...current,
        seats: exists
          ? current.seats.filter((item) => item.id !== seat.id)
          : [...current.seats, { id: seat.id, label: seat.label, price: seat.price, categoryCode: seat.categoryCode }],
      };
    });
  }, []);

  const clear = useCallback(() => {
    setSelection(emptySelection);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const subtotal = useMemo(
    () => selection.seats.reduce((sum, seat) => sum + (Number(seat.price) || 0), 0),
    [selection.seats],
  );

  const value = useMemo(
    () => ({ selection, setSelection, startShow, setSeats, toggleSeat, clear, subtotal }),
    [selection, startShow, setSeats, toggleSeat, clear, subtotal],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (!context) throw new Error('useBooking must be used inside <BookingProvider>');
  return context;
}

export default BookingContext;
