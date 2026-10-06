import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import validate from '../middleware/validate.js';
import env from '../config/env.js';
import {
  createBookingBody, bookingReferenceParam, payBookingBody,
  cancelBookingBody, findBookingsQuery,
} from '../schemas/index.js';
import {
  createBooking, payBooking, cancelBooking, getBookingByReference, listBookingsByEmail,
} from '../services/bookingService.js';

const router = Router();

/**
 * POST /api/bookings
 * Reserves seats and creates a PENDING booking (a seat hold).
 * Body: { showId, seatIds: number[], customer: { name, email, phone } }
 *
 * Returns 409 SEATS_UNAVAILABLE when a seat is taken or held by someone else.
 */
router.post(
  '/',
  validate(createBookingBody),
  asyncHandler(async (req, res) => {
    const booking = await createBooking(req.body);
    res.status(201).json({
      data: booking,
      message: `Seats held for ${env.booking.holdMinutes} minutes. Complete payment to confirm.`,
      meta: { holdMinutes: env.booking.holdMinutes },
    });
  }),
);

/**
 * GET /api/bookings?email=
 * "Find my tickets" lookup. Declared before /:reference so it is not shadowed.
 */
router.get(
  '/',
  validate(findBookingsQuery, 'query'),
  asyncHandler(async (req, res) => {
    const bookings = await listBookingsByEmail(req.query.email);
    res.json({ data: bookings, meta: { count: bookings.length } });
  }),
);

/**
 * GET /api/bookings/:reference
 * Public ticket lookup (the reference is the bearer token for the ticket).
 */
router.get(
  '/:reference',
  validate(bookingReferenceParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await getBookingByReference(req.params.reference) });
  }),
);

/**
 * POST /api/bookings/:reference/pay
 * Captures payment through the demo gateway and issues the ticket.
 * Idempotent: paying a confirmed booking returns the same ticket.
 */
router.post(
  '/:reference/pay',
  validate(bookingReferenceParam, 'params'),
  validate(payBookingBody),
  asyncHandler(async (req, res) => {
    const booking = await payBooking(req.params.reference, req.body);
    res.json({
      data: booking,
      message: 'Payment successful. Your ticket is confirmed.',
      meta: { simulatedGateway: env.booking.simulatePayments },
    });
  }),
);

/**
 * POST /api/bookings/:reference/cancel
 * Releases the seats immediately and refunds a captured payment.
 */
router.post(
  '/:reference/cancel',
  validate(bookingReferenceParam, 'params'),
  validate(cancelBookingBody),
  asyncHandler(async (req, res) => {
    const booking = await cancelBooking(req.params.reference, req.body ?? {});
    res.json({
      data: booking,
      message: 'Booking cancelled. Seats have been released.',
    });
  }),
);

export default router;
