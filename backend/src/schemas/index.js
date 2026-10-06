import { z } from 'zod';

/**
 * Request schemas.
 *
 * Keeping them in one file makes the API contract easy to review against
 * docs/API.md, and `validate()` guarantees handlers only ever see clean data.
 */

const id = z.coerce.number().int().positive();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use the format HH:MM');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

// ---------------------------------------------------------------------------
//  Catalogue
// ---------------------------------------------------------------------------
export const listMoviesQuery = z.object({
  status: z.enum(['now_showing', 'upcoming', 'archived']).optional(),
  genre: z.string().trim().min(1).max(40).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  language: z.string().trim().min(1).max(40).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  sort: z.enum(['rating', 'newest', 'oldest', 'title', 'popular']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const movieIdParam = z.object({ idOrSlug: z.string().trim().min(1).max(180) });

/** Generic `/:id` route parameter. */
export const idParam = z.object({ id });

export const showtimesQuery = z.object({
  date: dateString.optional(),
  city: z.string().trim().min(1).max(80).optional(),
  theatreId: id.optional(),
});

export const showIdParam = z.object({ id });

// ---------------------------------------------------------------------------
//  Bookings
// ---------------------------------------------------------------------------
export const createBookingBody = z.object({
  showId: id,
  seatIds: z.array(id).min(1, 'Select at least one seat').max(10, 'Too many seats selected'),
  customer: z.object({
    name: z.string().trim().min(2, 'Please enter your full name').max(120),
    email: z.string().trim().email('Enter a valid e-mail address').max(190),
    phone: z
      .string()
      .trim()
      .min(8, 'Enter a valid phone number')
      .max(20)
      .regex(/^[0-9+\-\s()]+$/, 'Phone numbers may only contain digits and + - ( )'),
  }),
});

export const bookingReferenceParam = z.object({
  reference: z.string().trim().min(6).max(24),
});

export const payBookingBody = z.object({
  method: z.enum(['CARD', 'UPI', 'NETBANKING', 'WALLET']).default('CARD'),
});

export const cancelBookingBody = z
  .object({ reason: z.string().trim().max(120).optional() })
  .default({});

export const findBookingsQuery = z.object({
  email: z.string().trim().email('Enter the e-mail used for the booking').max(190),
});

// ---------------------------------------------------------------------------
//  Auth
// ---------------------------------------------------------------------------
export const loginBody = z.object({
  email: z.string().trim().email().max(190),
  password: z.string().min(6, 'Passwords are at least 6 characters').max(128),
});

export const registerBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  phone: z.string().trim().min(8).max(20),
  password: z.string().min(6, 'Use at least 6 characters').max(128),
});

// ---------------------------------------------------------------------------
//  AI
// ---------------------------------------------------------------------------
const chatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(1000),
});

export const recommendBody = z.object({
  query: z.string().trim().min(3, 'Tell us what you feel like watching').max(400),
  limit: z.coerce.number().int().min(1).max(6).optional(),
});

export const aiSearchBody = z.object({
  query: z.string().trim().min(2, 'Type what you are looking for').max(400),
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

export const assistantBody = z.object({
  message: z.string().trim().min(1).max(800),
  history: z.array(chatMessage).max(12).optional(),
});

// ---------------------------------------------------------------------------
//  Admin
// ---------------------------------------------------------------------------
export const adminListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  date: dateString.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  movieId: id.optional(),
  theatreId: id.optional(),
});

export const movieBody = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(180).optional(),
  synopsis: z.string().trim().min(10, 'Write at least a short synopsis').max(5000),
  durationMinutes: z.coerce.number().int().min(30).max(360),
  language: z.string().trim().min(2).max(40),
  certificate: z.enum(['U', 'UA', 'A']).default('UA'),
  rating: z.coerce.number().min(0).max(10).default(0),
  voteCount: z.coerce.number().int().min(0).default(0),
  director: z.string().trim().max(120).optional(),
  cast: z.array(z.string().trim().max(120)).max(20).optional(),
  posterUrl: z.string().trim().max(300).optional(),
  backdropUrl: z.string().trim().max(300).optional(),
  trailerUrl: z.string().trim().max(300).optional(),
  releaseDate: isoDate,
  status: z.enum(['now_showing', 'upcoming', 'archived']).default('now_showing'),
  isFeatured: z.coerce.boolean().default(false),
  genres: z.array(z.string().trim().max(40)).max(12).optional(),
});

export const movieUpdateBody = movieBody.partial();

export const theatreBody = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(255),
  phone: z.string().trim().max(20).optional(),
  amenities: z.array(z.string().trim().max(60)).max(15).optional(),
  rating: z.coerce.number().min(0).max(5).default(4),
  isActive: z.coerce.boolean().optional(),
});

export const theatreUpdateBody = theatreBody.partial();

export const screenBody = z.object({
  theatreId: id,
  name: z.string().trim().min(1).max(60),
  screenType: z.enum(['2D', '3D', 'IMAX', '4DX', 'DOLBY_ATMOS']).default('2D'),
  totalRows: z.coerce.number().int().min(1).max(26),
  seatsPerRow: z.coerce.number().int().min(1).max(40),
  isActive: z.coerce.boolean().optional(),
  rebuildLayout: z.coerce.boolean().optional(),
});

export const screenUpdateBody = screenBody.partial();

export const showBody = z.object({
  movieId: id,
  screenId: id,
  showDate: dateString,
  startTime: timeString,
  language: z.string().trim().max(40).optional(),
  priceMultiplier: z.coerce.number().min(1).max(3).optional(),
  status: z.enum(['scheduled', 'cancelled', 'completed']).optional(),
});

export const showUpdateBody = showBody.partial();

export default {
  listMoviesQuery,
  createBookingBody,
  loginBody,
  adminListQuery,
  movieBody,
};
