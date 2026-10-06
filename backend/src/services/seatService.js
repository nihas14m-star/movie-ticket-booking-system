import { query } from '../db/pool.js';
import env from '../config/env.js';
import ApiError from '../utils/errors.js';
import { getShowForBooking, releaseExpiredHolds } from './showService.js';

/**
 * Seat map construction.
 *
 * Seat state priority:
 *   1. seat.is_active = 0                 -> BLOCKED  (broken / out of service)
 *   2. a live booking_seats row           -> BOOKED   (sold or held)
 *   3. otherwise                          -> AVAILABLE
 *
 * `booking_seats` only counts while the row is live: a CANCELLED or EXPIRED line
 * has a NULL `active_seat_key`, and expired holds are promoted to EXPIRED by
 * sp_release_expired_holds() before this map is built. That means a seat freed
 * by a cancellation or an abandoned checkout is immediately bookable again.
 */

/**
 * @param {number} showId
 * @returns {Promise<object>} everything the seat-selection UI needs
 */
export async function getSeatMap(showId) {
  const show = await getShowForBooking(showId);
  if (!show) throw ApiError.notFound('That show does not exist', 'SHOW_NOT_FOUND');

  // Housekeeping first: abandonments must not look like sold seats.
  await releaseExpiredHolds();

  const seats = await query(
    `SELECT se.id,
            se.row_label,
            se.seat_number,
            se.is_active,
            sc.code        AS category_code,
            sc.label       AS category_label,
            sc.base_price,
            sc.color_hex,
            bs.id          AS live_booking_seat_id
       FROM seats se
       JOIN seat_categories sc ON sc.id = se.category_id
       LEFT JOIN booking_seats bs
              ON bs.seat_id = se.id
             AND bs.show_id = :showId
             AND bs.status  = 'CONFIRMED'
      WHERE se.screen_id = :screenId
      ORDER BY se.row_label, se.seat_number`,
    { showId, screenId: show.screen_id },
  );

  const multiplier = Number(show.price_multiplier) || 1;
  const priceOf = (basePrice) => Math.round(Number(basePrice) * multiplier * 100) / 100;

  // Category legend (ordered by price so the UI can render tiers consistently).
  const categoryMap = new Map();
  for (const seat of seats) {
    if (!categoryMap.has(seat.category_code)) {
      categoryMap.set(seat.category_code, {
        code: seat.category_code,
        label: seat.category_label,
        colorHex: seat.color_hex,
        basePrice: seat.base_price,
        price: priceOf(seat.base_price),
        seatCount: 0,
      });
    }
    categoryMap.get(seat.category_code).seatCount += 1;
  }
  const categories = [...categoryMap.values()].sort((a, b) => a.price - b.price);

  // Rows, each carrying its own category (our screens have single-tier rows).
  const rowMap = new Map();
  const summary = { total: 0, available: 0, booked: 0, blocked: 0 };
  const categorySummary = Object.fromEntries(
    categories.map((category) => [category.code, { available: 0, booked: 0, total: 0 }]),
  );

  for (const seat of seats) {
    const status = !seat.is_active ? 'BLOCKED' : seat.live_booking_seat_id ? 'BOOKED' : 'AVAILABLE';
    const label = `${seat.row_label}${String(seat.seat_number).padStart(2, '0')}`;

    if (!rowMap.has(seat.row_label)) {
      rowMap.set(seat.row_label, {
        rowLabel: seat.row_label,
        categoryCode: seat.category_code,
        categoryLabel: seat.category_label,
        price: priceOf(seat.base_price),
        seats: [],
      });
    }

    rowMap.get(seat.row_label).seats.push({
      id: seat.id,
      label,
      rowLabel: seat.row_label,
      seatNumber: seat.seat_number,
      categoryCode: seat.category_code,
      price: priceOf(seat.base_price),
      status,
    });

    const key = status === 'AVAILABLE' ? 'available' : status === 'BOOKED' ? 'booked' : 'blocked';
    summary[key] += 1;
    summary.total += 1;

    const bucket = categorySummary[seat.category_code];
    if (bucket) {
      bucket.total += 1;
      if (key === 'available') bucket.available += 1;
      if (key === 'booked') bucket.booked += 1;
    }
  }

  return {
    show: {
      id: show.id,
      showDate: show.show_date,
      startTime: show.start_time,
      endTime: show.end_time,
      language: show.language,
      status: show.status,
      priceMultiplier: show.price_multiplier,
      isPast: isShowInThePast(show),
      movie: {
        id: show.movie_id,
        title: show.movie_title,
        durationMinutes: show.duration_minutes,
        certificate: show.certificate,
      },
      theatre: { id: show.theatre_id, name: show.theatre_name, city: show.city, address: show.address },
      screen: { name: show.screen_name, screenType: show.screen_type },
    },
    categories,
    categorySummary,
    rows: [...rowMap.values()],
    summary,
    pricing: {
      convenienceFeePercent: env.booking.convenienceFeePercent,
      maxSeatsPerBooking: env.booking.maxSeatsPerBooking,
      currency: 'INR',
    },
    rules: {
      minSeats: 1,
      maxSeats: env.booking.maxSeatsPerBooking,
      holdMinutes: env.booking.holdMinutes,
    },
  };
}

export function isShowInThePast(show) {
  const start = new Date(`${show.show_date}T${show.start_time}Z`);
  return Number.isFinite(start.getTime()) ? start.getTime() <= Date.now() : false;
}

/**
 * Validates a requested seat selection against the live database state.
 * Used inside the booking transaction, where the caller already holds locks.
 *
 * @returns {Promise<{seats: object[], subtotal: number}>}
 */
export async function resolveSeatsForBooking(connection, showId, seatIds) {
  const placeholders = seatIds.map(() => '?').join(',');
  const [seats] = await connection.execute(
    `SELECT se.id, se.screen_id, se.row_label, se.seat_number, se.is_active,
            sc.code AS category_code, sc.label AS category_label, sc.base_price
       FROM seats se
       JOIN seat_categories sc ON sc.id = se.category_id
      WHERE se.id IN (${placeholders})
      ORDER BY se.row_label, se.seat_number`,
    seatIds,
  );

  if (seats.length !== seatIds.length) {
    const found = new Set(seats.map((seat) => seat.id));
    const missing = seatIds.filter((id) => !found.has(id));
    throw ApiError.badRequest(`Unknown seat(s): ${missing.join(', ')}`, 'UNKNOWN_SEATS');
  }

  const inactive = seats.filter((seat) => !seat.is_active);
  if (inactive.length) {
    throw ApiError.conflict(
      `Seat(s) ${inactive.map((seat) => `${seat.row_label}${seat.seat_number}`).join(', ')} are not available for sale`,
      'SEATS_BLOCKED',
    );
  }
  return seats;
}

export default { getSeatMap, resolveSeatsForBooking, isShowInThePast };
