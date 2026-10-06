import { query, queryOne, queryWith, withTransaction } from '../db/pool.js';
import env from '../config/env.js';
import ApiError from '../utils/errors.js';
import { generateBookingReference, generatePaymentReference, normaliseBookingReference } from '../utils/ids.js';
import { resolveSeatsForBooking, isShowInThePast } from './seatService.js';
import { releaseExpiredHolds } from './showService.js';

/**
 * Booking lifecycle.
 *
 *   create  -> PENDING   seats held for BOOKING_HOLD_MINUTES
 *   pay     -> CONFIRMED payment captured (simulated gateway), ticket issued
 *   cancel  -> CANCELLED seat lines released, payment refunded
 *   (timer) -> EXPIRED   hold abandoned, seats released by the database
 *
 * Concurrency strategy
 * --------------------
 * 1. The screening row is locked with SELECT ... FOR UPDATE, which serialises
 *    concurrent attempts for the same screening.
 * 2. Live seat lines are re-checked and locked inside the same transaction.
 * 3. `booking_seats` carries UNIQUE (show_id, seat_id, active_seat_key), so even
 *    if application locking were bypassed, MySQL refuses the second insert.
 *
 * Money is handled in integer paise and only formatted to 2 decimals at the
 * boundary. That keeps `total_amount = subtotal + convenience_fee` (a CHECK
 * constraint) exact instead of accumulating floating point error.
 */

const toPaise = (value) => Math.round(Number(value) * 100);
const toAmount = (paise) => (paise / 100).toFixed(2);

/** Shape a booking + its seats into the object the API returns. */
export function mapBooking(row, seats = [], payment = null) {
  if (!row) return null;
  return {
    id: row.id,
    bookingReference: row.booking_reference,
    status: row.status,
    seatCount: row.seat_count,
    subtotal: row.subtotal,
    convenienceFee: row.convenience_fee,
    totalAmount: row.total_amount,
    currency: row.currency,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    holdMinutes: row.status === 'PENDING' && row.expires_at
      ? Math.max(0, Math.round((new Date(row.expires_at).getTime() - Date.now()) / 60000))
      : 0,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    movie: row.movie_title
      ? {
        id: row.movie_id,
        title: row.movie_title,
        posterUrl: row.poster_url,
        certificate: row.certificate,
        durationMinutes: row.duration_minutes,
        language: row.language,
      }
      : undefined,
    show: row.show_id
      ? {
        id: row.show_id,
        showDate: row.show_date,
        startTime: row.start_time,
        endTime: row.end_time,
        screenName: row.screen_name,
        screenType: row.screen_type,
        theatreName: row.theatre_name,
        city: row.city,
      }
      : undefined,
    seats: seats.map((seat) => ({
      id: seat.seat_id,
      label: seat.label,
      rowLabel: seat.row_label,
      seatNumber: seat.seat_number,
      categoryCode: seat.category_code,
      categoryLabel: seat.category_label,
      price: seat.unit_price,
      status: seat.status,
    })),
    payment: payment
      ? {
        reference: payment.payment_reference,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        paidAt: payment.paid_at,
        message: payment.gateway_message,
      }
      : null,
    // A QR payload for the digital ticket. It encodes the reference the staff
    // scanner would look up - nothing sensitive.
    qrPayload: `CINEVERSE|${row.booking_reference}|${row.show_id ?? ''}|${row.seat_count}`,
  };
}

/** Loads a booking with its seat lines (and payment when present). */
async function loadBooking(connection, bookingId) {
  const rows = await queryWith(
    connection,
    `SELECT b.*,
            sh.show_date, sh.start_time, sh.end_time, sh.id AS show_id,
            m.id AS movie_id, m.title AS movie_title, m.poster_url, m.certificate,
            m.duration_minutes, m.language,
            sc.name AS screen_name, sc.screen_type,
            t.name AS theatre_name, t.city
       FROM bookings b
       JOIN shows  sh ON sh.id = b.show_id
       JOIN movies m  ON m.id  = sh.movie_id
       JOIN screens sc ON sc.id = sh.screen_id
       JOIN theatres t ON t.id  = sc.theatre_id
      WHERE b.id = :bookingId`,
    { bookingId },
  );
  const booking = rows[0];
  if (!booking) return null;

  const seats = await queryWith(
    connection,
    `SELECT bs.seat_id, bs.unit_price, bs.status, bs.category_code,
            se.row_label, se.seat_number,
            CONCAT(se.row_label, LPAD(se.seat_number, 2, '0')) AS label,
            sc.label AS category_label
       FROM booking_seats bs
       JOIN seats se ON se.id = bs.seat_id
       JOIN seat_categories sc ON sc.id = se.category_id
      WHERE bs.booking_id = :bookingId
      ORDER BY se.row_label, se.seat_number`,
    { bookingId },
  );

  const payments = await queryWith(
    connection,
    `SELECT * FROM payments WHERE booking_id = :bookingId ORDER BY id DESC LIMIT 1`,
    { bookingId },
  );

  return mapBooking(booking, seats, payments[0] ?? null);
}

/**
 * Finds an existing customer by e-mail or creates a guest account.
 * Returns the user id.
 */
async function findOrCreateCustomer(connection, customer) {
  const email = String(customer.email).trim().toLowerCase();
  const [result] = await connection.execute(
    `INSERT INTO users (full_name, email, phone, role, password_hash)
     VALUES (:fullName, :email, :phone, 'customer', NULL)
     ON DUPLICATE KEY UPDATE
       id        = LAST_INSERT_ID(id),
       full_name = VALUES(full_name),
       phone     = VALUES(phone)`,
    { fullName: customer.name.trim(), email, phone: customer.phone.trim() },
  );
  return result.insertId;
}

/**
 * Reserves seats and creates a PENDING booking.
 *
 * @param {{showId:number, seatIds:number[], customer:{name:string,email:string,phone:string}}} input
 */
export async function createBooking({ showId, seatIds, customer }) {
  const uniqueSeatIds = [...new Set(seatIds.map(Number))].sort((a, b) => a - b);
  if (uniqueSeatIds.length !== seatIds.length) {
    throw ApiError.badRequest('The same seat was selected more than once', 'DUPLICATE_SEATS');
  }
  if (uniqueSeatIds.length > env.booking.maxSeatsPerBooking) {
    throw ApiError.badRequest(
      `You can book at most ${env.booking.maxSeatsPerBooking} seats in one transaction`,
      'TOO_MANY_SEATS',
      { maxSeats: env.booking.maxSeatsPerBooking },
    );
  }

  // Housekeeping outside the transaction so the locks inside stay short.
  await releaseExpiredHolds();

  return withTransaction(async (connection) => {
    // 1 — Serialise concurrent bookings for this screening.
    const [showRows] = await connection.execute(
      `SELECT sh.id, sh.status, sh.show_date, sh.start_time, sh.price_multiplier,
              sh.screen_id, sh.language,
              m.title AS movie_title, m.duration_minutes
         FROM shows sh
         JOIN movies m ON m.id = sh.movie_id
        WHERE sh.id = :showId
        FOR UPDATE`,
      { showId },
    );
    const show = showRows[0];
    if (!show) throw ApiError.notFound('That show does not exist', 'SHOW_NOT_FOUND');
    if (show.status === 'cancelled') {
      throw ApiError.conflict('This show has been cancelled', 'SHOW_CANCELLED');
    }
    if (show.status === 'completed' || isShowInThePast(show)) {
      throw ApiError.conflict('This show has already started', 'SHOW_STARTED');
    }

    // 2 — Seats must exist and belong to the screen hosting this show.
    const seats = await resolveSeatsForBooking(connection, showId, uniqueSeatIds);
    const wrongScreen = seats.filter((seat) => seat.screen_id !== show.screen_id);
    if (wrongScreen.length) {
      throw ApiError.badRequest('Selected seats do not belong to this screen', 'SEAT_SCREEN_MISMATCH');
    }

    // 3 — Reject seats that are already sold or held.
    const placeholders = uniqueSeatIds.map(() => '?').join(',');
    const [taken] = await connection.execute(
      `SELECT bs.seat_id
         FROM booking_seats bs
        WHERE bs.show_id = ?
          AND bs.seat_id IN (${placeholders})
          AND bs.status = 'CONFIRMED'
        FOR UPDATE`,
      [showId, ...uniqueSeatIds],
    );
    if (taken.length) {
      const takenSet = new Set(taken.map((row) => row.seat_id));
      const labels = seats
        .filter((seat) => takenSet.has(seat.id))
        .map((seat) => `${seat.row_label}${String(seat.seat_number).padStart(2, '0')}`);
      throw ApiError.conflict(
        labels.length
          ? `Seat${labels.length > 1 ? 's' : ''} ${labels.join(', ')} ${labels.length > 1 ? 'are' : 'is'} no longer available`
          : 'One of the selected seats is no longer available',
        'SEATS_UNAVAILABLE',
        { seatIds: [...takenSet], seatLabels: labels },
      );
    }

    // 4 — Customer record (guest checkout creates it on the fly).
    const userId = await findOrCreateCustomer(connection, customer);

    // 5 — Money, in integer paise.
    const multiplier = Number(show.price_multiplier) || 1;
    const lines = seats.map((seat) => ({
      seatId: seat.id,
      categoryCode: seat.category_code,
      unitPricePaise: Math.round(toPaise(seat.base_price) * multiplier),
    }));
    const subtotalPaise = lines.reduce((sum, line) => sum + line.unitPricePaise, 0);
    const feePaise = Math.round((subtotalPaise * env.booking.convenienceFeePercent) / 100);
    const totalPaise = subtotalPaise + feePaise;

    // 6 — Booking header. A reference collision (1 in ~1e12) is retried.
    let bookingId = null;
    let reference = null;
    for (let attempt = 0; attempt < 3 && bookingId === null; attempt += 1) {
      reference = generateBookingReference();
      try {
        const [result] = await connection.execute(
          `INSERT INTO bookings
             (booking_reference, user_id, show_id, status, seat_count, subtotal,
              convenience_fee, total_amount, currency, customer_name, customer_email,
              customer_phone, expires_at)
           VALUES
             (:reference, :userId, :showId, 'PENDING', :seatCount, :subtotal,
              :convenienceFee, :totalAmount, 'INR', :customerName, :customerEmail,
              :customerPhone, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :holdMinutes MINUTE))`,
          {
            reference,
            userId,
            showId,
            seatCount: lines.length,
            subtotal: toAmount(subtotalPaise),
            convenienceFee: toAmount(feePaise),
            totalAmount: toAmount(totalPaise),
            customerName: customer.name.trim(),
            customerEmail: String(customer.email).trim().toLowerCase(),
            customerPhone: customer.phone.trim(),
            holdMinutes: env.booking.holdMinutes,
          },
        );
        bookingId = result.insertId;
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
      }
    }

    // 7 — Seat lines. This INSERT is what the unique index protects.
    const valuesSql = lines.map(() => '(?, ?, ?, ?, ?, \'CONFIRMED\')').join(', ');
    const valuesParams = lines.flatMap((line) => [
      bookingId,
      showId,
      line.seatId,
      line.categoryCode,
      toAmount(line.unitPricePaise),
    ]);
    await connection.execute(
      `INSERT INTO booking_seats (booking_id, show_id, seat_id, category_code, unit_price, status)
       VALUES ${valuesSql}`,
      valuesParams,
    );

    return loadBooking(connection, bookingId);
  });
}

/**
 * Captures payment and confirms the booking.
 *
 * The bundled gateway is a SIMULATION (see SIMULATE_PAYMENTS): it records a
 * payments row exactly like a real integration would, which is what makes the
 * rest of the system - refunds, reports, reconciliation - behave realistically.
 * Swapping in Razorpay/Stripe means replacing the `authorise` call below.
 */
export async function payBooking(reference, { method = 'CARD' } = {}) {
  const normalised = normaliseBookingReference(reference);

  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, status, total_amount, expires_at FROM bookings WHERE booking_reference = :reference FOR UPDATE`,
      { reference: normalised },
    );
    const booking = rows[0];
    if (!booking) throw ApiError.notFound('No booking found for that reference', 'BOOKING_NOT_FOUND');

    if (booking.status === 'CONFIRMED') {
      // Idempotent: paying twice must not double-charge or fail.
      return loadBooking(connection, booking.id);
    }
    if (booking.status === 'CANCELLED') {
      throw ApiError.conflict('This booking was cancelled', 'BOOKING_CANCELLED');
    }
    if (booking.status === 'EXPIRED' || (booking.expires_at && new Date(booking.expires_at) < new Date())) {
      throw ApiError.conflict(
        'Your seat hold has expired. Please select your seats again.',
        'BOOKING_EXPIRED',
      );
    }

    // --- Simulated authorisation -------------------------------------------
    const shouldFail = env.booking.paymentFailureRate > 0
      && Math.random() < env.booking.paymentFailureRate;
    const paymentReference = generatePaymentReference();

    if (shouldFail) {
      await connection.execute(
        `INSERT INTO payments (booking_id, payment_reference, amount, method, status, gateway_message)
         VALUES (:bookingId, :reference, :amount, :method, 'FAILED', :message)
         ON DUPLICATE KEY UPDATE
           status = 'FAILED', gateway_message = VALUES(gateway_message), method = VALUES(method)`,
        {
          bookingId: booking.id,
          reference: paymentReference,
          amount: booking.total_amount,
          method,
          message: 'Demo gateway: payment declined by the issuing bank',
        },
      );
      throw ApiError.conflict(
        'Payment was declined by the demo gateway. You can try a different method.',
        'PAYMENT_FAILED',
      );
    }

    await connection.execute(
      `INSERT INTO payments (booking_id, payment_reference, amount, method, status, gateway_message, paid_at)
       VALUES (:bookingId, :reference, :amount, :method, 'SUCCESS', :message, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         payment_reference = VALUES(payment_reference),
         status = 'SUCCESS',
         method = VALUES(method),
         gateway_message = VALUES(gateway_message),
         paid_at = UTC_TIMESTAMP()`,
      {
        bookingId: booking.id,
        reference: paymentReference,
        amount: booking.total_amount,
        method,
        message: 'Demo gateway: payment captured successfully',
      },
    );

    await connection.execute(
      `UPDATE bookings
          SET status = 'CONFIRMED', confirmed_at = UTC_TIMESTAMP(), expires_at = NULL
        WHERE id = :bookingId AND status = 'PENDING'`,
      { bookingId: booking.id },
    );

    // Any other live hold competing for these seats is now impossible: the
    // unique index guarantees a seat has exactly one live booking line.
    return loadBooking(connection, booking.id);
  });
}

/** Cancels a PENDING or CONFIRMED booking and frees its seats. */
export async function cancelBooking(reference, { reason } = {}) {
  const normalised = normaliseBookingReference(reference);

  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, status, confirmed_at FROM bookings WHERE booking_reference = :reference FOR UPDATE`,
      { reference: normalised },
    );
    const booking = rows[0];
    if (!booking) throw ApiError.notFound('No booking found for that reference', 'BOOKING_NOT_FOUND');
    if (booking.status === 'CANCELLED') return loadBooking(connection, booking.id);

    // Seat lines become CANCELLED, which nulls active_seat_key -> seats free up.
    await connection.execute(
      `UPDATE booking_seats SET status = 'CANCELLED'
        WHERE booking_id = :bookingId AND status = 'CONFIRMED'`,
      { bookingId: booking.id },
    );
    await connection.execute(
      `UPDATE bookings SET status = 'CANCELLED', cancelled_at = UTC_TIMESTAMP()
        WHERE id = :bookingId`,
      { bookingId: booking.id },
    );
    if (booking.confirmed_at) {
      await connection.execute(
        `UPDATE payments SET status = 'REFUNDED',
                gateway_message = CONCAT('Demo gateway: refunded', :reason)
          WHERE booking_id = :bookingId AND status = 'SUCCESS'`,
        { bookingId: booking.id, reason: reason ? ` (${reason})` : '' },
      );
    }

    return loadBooking(connection, booking.id);
  });
}

/** Public ticket lookup by reference. */
export async function getBookingByReference(reference) {
  const normalised = normaliseBookingReference(reference);
  const row = await queryOne(
    'SELECT id FROM bookings WHERE booking_reference = :reference',
    { reference: normalised },
  );
  if (!row) throw ApiError.notFound('No booking found for that reference', 'BOOKING_NOT_FOUND');
  return loadBooking(null, row.id);
}

/** Bookings belonging to an e-mail address (the "find my tickets" screen). */
export async function listBookingsByEmail(email) {
  const rows = await query(
    `SELECT id FROM bookings
      WHERE customer_email = :email
      ORDER BY created_at DESC, id DESC
      LIMIT 25`,
    { email: String(email).trim().toLowerCase() },
  );
  return Promise.all(rows.map((row) => loadBooking(null, row.id)));
}

/**
 * Counts live holds per show, used by the admin dashboard.
 */
export async function getHoldStats() {
  return queryOne(`
    SELECT
      SUM(status = 'PENDING')   AS pending,
      SUM(status = 'CONFIRMED') AS confirmed,
      SUM(status = 'CANCELLED') AS cancelled,
      SUM(status = 'EXPIRED')   AS expired
    FROM bookings`);
}

export default {
  createBooking,
  payBooking,
  cancelBooking,
  getBookingByReference,
  listBookingsByEmail,
  mapBooking,
  getHoldStats,
};
