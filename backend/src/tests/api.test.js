/**
 * Integration tests.
 *
 * These run against a REAL MySQL database and a REAL HTTP server (started on an
 * ephemeral port by this file), because the guarantees we care about — seat
 * locking, generated columns, triggers, CHECK constraints — only exist in the
 * database. Mocking would test nothing.
 *
 *   npm run db:reset      # once, to load schema + sample data
 *   npm test
 *
 * Any booking created here is cancelled again in the cleanup step, so the suite
 * is repeatable.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { ping, closePool, query } from '../db/pool.js';

let server;
let baseUrl;
let databaseAvailable = false;

// Everything created during the run, so cleanup can undo it.
const createdBookings = [];

before(async () => {
  try {
    await ping();
    databaseAvailable = true;
  } catch {
    databaseAvailable = false;
  }

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (databaseAvailable) {
    // Release any seats the tests are still holding.
    for (const reference of createdBookings) {
      await fetch(`${baseUrl}/api/bookings/${reference}/cancel`, { method: 'POST' }).catch(() => {});
    }
  }
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

/** Small fetch helper returning { status, body }. */
async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

const skipWithoutDb = (t) => {
  if (!databaseAvailable) {
    t.skip('MySQL is not reachable — run `npm run db:reset` first');
    return true;
  }
  return false;
};

/** Find a future screening and some free seats on it. */
async function findBookableShow(seatCount = 2) {
  const { body } = await api('/api/movies?status=now_showing&limit=1');
  const movie = body.data[0];
  const shows = await api(`/api/movies/${movie.slug}/shows`);
  const dates = shows.body.data.dates;

  for (const date of dates) {
    const listing = await api(`/api/movies/${movie.slug}/shows?date=${date.date}`);
    for (const theatre of listing.body.data.theatres) {
      for (const show of theatre.shows) {
        if (show.availableSeats < seatCount) continue;
        const map = await api(`/api/shows/${show.id}/seats`);
        const available = map.body.data.rows
          .flatMap((row) => row.seats)
          .filter((seat) => seat.status === 'AVAILABLE');
        if (available.length >= seatCount) {
          return { show, map: map.body.data, seats: available.slice(0, seatCount), allSeats: available };
        }
      }
    }
  }
  throw new Error('No bookable show with free seats found — is the database seeded?');
}

const customer = {
  name: 'Test Runner',
  email: 'test.runner@cineverse.dev',
  phone: '+91 90000 12345',
};

// ---------------------------------------------------------------------------
//  Service health & catalogue
// ---------------------------------------------------------------------------

test('GET /api/health reports a ready database', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.database.connected, true);
  assert.equal(body.database.schemaReady, true);
  assert.ok(body.database.tables >= 13, 'expected at least 13 tables/views');
});

test('GET /api/movies paginates and filters', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/movies?status=now_showing&limit=3&page=1');
  assert.equal(status, 200);
  assert.equal(body.data.length, 3);
  assert.equal(body.meta.limit, 3);
  assert.ok(body.meta.total >= 4);
  for (const movie of body.data) {
    assert.equal(movie.status, 'now_showing');
    assert.ok(Array.isArray(movie.genres));
    assert.ok(movie.genres.length > 0, `${movie.title} should have genres`);
  }
});

test('GET /api/movies supports genre, search and city filters', async (t) => {
  if (skipWithoutDb(t)) return;
  const byGenre = await api('/api/movies?genre=comedy');
  assert.equal(byGenre.status, 200);
  assert.ok(byGenre.body.data.length > 0);
  for (const movie of byGenre.body.data) {
    assert.ok(movie.genres.some((genre) => genre.slug === 'comedy'), `${movie.title} is not a comedy`);
  }

  const bySearch = await api('/api/movies?search=neon');
  assert.ok(bySearch.body.data.some((movie) => /neon/i.test(movie.title)));

  const byCity = await api('/api/movies?city=Vijayawada');
  assert.ok(byCity.body.data.length > 0, 'Vijayawada should have movies');
});

test('GET /api/movies/:slug exposes details, cast and genres', async (t) => {
  if (skipWithoutDb(t)) return;
  const { body } = await api('/api/movies/neon-horizon');
  assert.equal(body.data.slug, 'neon-horizon');
  assert.ok(body.data.cast.length > 0);
  assert.ok(body.data.durationLabel.includes('h'));
  assert.ok(body.data.genres.length > 0);
});

test('GET /api/movies/:slug/shows groups showtimes by theatre with live availability', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/movies/neon-horizon/shows');
  assert.equal(status, 200);
  assert.equal(body.data.dates.length, 7);
  assert.ok(body.data.theatres.length > 0, 'expected theatres for the default date');
  const [theatre] = body.data.theatres;
  assert.ok(theatre.shows.length > 0);
  const [show] = theatre.shows;
  assert.ok(show.priceFrom > 0);
  assert.ok(show.availableSeats <= show.totalSeats);
  assert.equal(show.availableSeats, show.totalSeats - show.bookedSeats);
});

test('GET /api/shows/:id/seats returns a consistent hall map', async (t) => {
  if (skipWithoutDb(t)) return;
  const { show, map } = await findBookableShow(1);

  assert.equal(map.show.id, show.id);
  assert.ok(map.rows.length > 0);
  assert.ok(map.categories.length >= 1);
  assert.equal(map.summary.total, map.rows.reduce((sum, row) => sum + row.seats.length, 0));

  const counted = { AVAILABLE: 0, BOOKED: 0, BLOCKED: 0 };
  for (const seat of map.rows.flatMap((row) => row.seats)) {
    counted[seat.status] += 1;
    assert.ok(['AVAILABLE', 'BOOKED', 'BLOCKED'].includes(seat.status));
  }
  assert.equal(map.summary.available, counted.AVAILABLE);
  assert.equal(map.summary.booked, counted.BOOKED);
  assert.equal(map.summary.blocked, counted.BLOCKED);

  // Row labels must be a full alphabetically ordered set.
  const labels = map.rows.map((row) => row.rowLabel);
  assert.deepEqual(labels, [...labels].sort());
});

// ---------------------------------------------------------------------------
//  Booking flow
// ---------------------------------------------------------------------------

test('full booking flow: hold -> pay -> ticket -> seat no longer available', async (t) => {
  if (skipWithoutDb(t)) return;
  const { show, seats } = await findBookableShow(2);
  const seatIds = seats.map((seat) => seat.id);

  // 1 — reserve
  const created = await api('/api/bookings', {
    method: 'POST',
    body: { showId: show.id, seatIds, customer },
  });
  assert.equal(created.status, 201);
  const reference = created.body.data.bookingReference;
  createdBookings.push(reference);

  assert.match(reference, /^CV-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(created.body.data.status, 'PENDING');
  assert.equal(created.body.data.seats.length, 2);
  assert.equal(created.body.data.customer.email, customer.email);

  const subtotal = created.body.data.seats.reduce((sum, seat) => sum + seat.price, 0);
  assert.equal(Math.round(subtotal * 100) / 100, created.body.data.subtotal);
  assert.equal(
    created.body.data.totalAmount,
    Math.round((created.body.data.subtotal + created.body.data.convenienceFee) * 100) / 100,
  );

  // 2 — the seat map must now show them as taken
  const afterHold = await api(`/api/shows/${show.id}/seats`);
  const heldSeats = afterHold.body.data.rows
    .flatMap((row) => row.seats)
    .filter((seat) => seatIds.includes(seat.id));
  assert.equal(heldSeats.length, 2);
  for (const seat of heldSeats) {
    assert.equal(seat.status, 'BOOKED', `seat ${seat.label} should be held`);
  }

  // 3 — pay
  const paid = await api(`/api/bookings/${reference}/pay`, { method: 'POST', body: { method: 'UPI' } });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.data.status, 'CONFIRMED');
  assert.equal(paid.body.data.payment.status, 'SUCCESS');
  assert.equal(paid.body.data.payment.method, 'UPI');
  assert.ok(paid.body.data.confirmedAt);

  // 4 — paying twice is idempotent
  const paidAgain = await api(`/api/bookings/${reference}/pay`, { method: 'POST', body: { method: 'CARD' } });
  assert.equal(paidAgain.status, 200);
  assert.equal(paidAgain.body.data.status, 'CONFIRMED');

  // 5 — a second attempt for the same seats is rejected
  const retry = await api('/api/bookings', {
    method: 'POST',
    body: { showId: show.id, seatIds, customer: { ...customer, email: 'other@cineverse.dev' } },
  });
  assert.equal(retry.status, 409);
  assert.equal(retry.body.error.code, 'SEATS_UNAVAILABLE');

  // 6 — the ticket is retrievable by reference, with seat labels
  const ticket = await api(`/api/bookings/${reference}`);
  assert.equal(ticket.status, 200);
  assert.equal(ticket.body.data.seats.length, 2);
  assert.match(ticket.body.data.qrPayload, /^CINEVERSE\|CV-/);

  // 7 — cancel releases the seats again
  const cancelled = await api(`/api/bookings/${reference}/cancel`, { method: 'POST' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.status, 'CANCELLED');
  assert.equal(cancelled.body.data.payment.status, 'REFUNDED');

  const afterCancel = await api(`/api/shows/${show.id}/seats`);
  for (const seat of afterCancel.body.data.rows.flatMap((row) => row.seats)) {
    if (seatIds.includes(seat.id)) {
      assert.equal(seat.status, 'AVAILABLE', `seat ${seat.label} should be free after cancellation`);
    }
  }

  // 8 — and they can be booked again
  const rebooked = await api('/api/bookings', {
    method: 'POST',
    body: { showId: show.id, seatIds, customer },
  });
  assert.equal(rebooked.status, 201, 'released seats must be bookable again');
  createdBookings.push(rebooked.body.data.bookingReference);
});

test('concurrent requests for the same seat produce exactly one winner', async (t) => {
  if (skipWithoutDb(t)) return;
  const { show, allSeats } = await findBookableShow(1);
  const seatId = allSeats[0].id;

  const attempts = 6;
  const responses = await Promise.all(
    Array.from({ length: attempts }, (_, index) => api('/api/bookings', {
      method: 'POST',
      body: {
        showId: show.id,
        seatIds: [seatId],
        customer: { ...customer, email: `race.${index}@cineverse.dev` },
      },
    })),
  );

  const winners = responses.filter((response) => response.status === 201);
  const losers = responses.filter((response) => response.status === 409);

  assert.equal(winners.length, 1, `expected exactly 1 winner, got ${winners.length}`);
  assert.equal(losers.length, attempts - 1, 'every other attempt must fail with 409');
  for (const loser of losers) {
    assert.equal(loser.body.error.code, 'SEATS_UNAVAILABLE');
  }

  const winner = winners[0].body.data;
  createdBookings.push(winner.bookingReference);

  // The database itself must hold exactly one live line for that seat.
  const rows = await query(
    `SELECT COUNT(*) AS live FROM booking_seats
      WHERE show_id = :showId AND seat_id = :seatId AND status = 'CONFIRMED'`,
    { showId: show.id, seatId },
  );
  assert.equal(rows[0].live, 1, 'exactly one live booking_seats row must exist');
});

test('validation rejects malformed bookings', async (t) => {
  if (skipWithoutDb(t)) return;

  const noSeats = await api('/api/bookings', {
    method: 'POST',
    body: { showId: 1, seatIds: [], customer },
  });
  assert.equal(noSeats.status, 400);
  assert.equal(noSeats.body.error.code, 'VALIDATION_ERROR');

  const badEmail = await api('/api/bookings', {
    method: 'POST',
    body: { showId: 1, seatIds: [1], customer: { ...customer, email: 'not-an-email' } },
  });
  assert.equal(badEmail.status, 400);

  const tooMany = await api('/api/bookings', {
    method: 'POST',
    body: {
      showId: 1,
      seatIds: Array.from({ length: 12 }, (_, index) => index + 1),
      customer,
    },
  });
  assert.equal(tooMany.status, 400);

  const unknownBooking = await api('/api/bookings/CV-XXXX-XXXX');
  assert.equal(unknownBooking.status, 404);
  assert.equal(unknownBooking.body.error.code, 'BOOKING_NOT_FOUND');
});

test('a completed show refuses new bookings', async (t) => {
  if (skipWithoutDb(t)) return;
  const past = await query(
    `SELECT sh.id, sh.screen_id FROM shows sh WHERE sh.status = 'completed' LIMIT 1`,
  );
  if (!past.length) {
    t.skip('no completed shows in the sample data');
    return;
  }
  const seat = await query(
    'SELECT id FROM seats WHERE screen_id = :screenId AND is_active = 1 LIMIT 1',
    { screenId: past[0].screen_id },
  );

  const response = await api('/api/bookings', {
    method: 'POST',
    body: { showId: past[0].id, seatIds: [seat[0].id], customer },
  });
  assert.equal(response.status, 409);
  assert.ok(['SHOW_STARTED', 'SHOW_CANCELLED'].includes(response.body.error.code));
});

test('GET /api/bookings?email= finds a customer tickets', async (t) => {
  if (skipWithoutDb(t)) return;
  const { body } = await api(`/api/bookings?email=${encodeURIComponent(customer.email)}`);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length >= 1, 'the test customer should have at least one booking');
  assert.ok(body.data.every((booking) => booking.customer.email === customer.email));
});

// ---------------------------------------------------------------------------
//  AI (graceful fallback)
// ---------------------------------------------------------------------------

test('AI recommendations always answer, with or without an OpenRouter key', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/ai/recommend', {
    method: 'POST',
    body: { query: 'I want a funny family movie under 2 hours', limit: 3 },
  });
  assert.equal(status, 200);
  assert.ok(body.data.movies.length > 0, 'fallback must still return movies');
  assert.ok(['openrouter', 'fallback'].includes(body.data.source));
  assert.ok(body.data.summary.length > 0);

  // Every recommended id must exist in our catalogue (no hallucinated films).
  for (const movie of body.data.movies) {
    const check = await api(`/api/movies/${movie.id}`);
    assert.equal(check.status, 200);
    assert.equal(check.body.data.title, movie.title);
  }
});

test('AI natural-language search resolves to real catalogue rows', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/ai/search', {
    method: 'POST',
    body: { query: 'action movies under 2.5 hours' },
  });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.data.movies));
  for (const movie of body.data.movies) {
    assert.ok(movie.durationMinutes <= 150, `${movie.title} is longer than requested`);
  }
});

test('AI assistant explains booking and never invents showtimes', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/ai/assistant', {
    method: 'POST',
    body: { message: 'How do I book tickets?' },
  });
  assert.equal(status, 200);
  assert.ok(body.data.reply.length > 20);
  assert.ok(Array.isArray(body.data.movies));
});

test('GET /api/ai/status reports configuration without leaking the key', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/ai/status');
  assert.equal(status, 200);
  assert.equal(typeof body.data.enabled, 'boolean');
  assert.equal(JSON.stringify(body).includes('sk-or'), false, 'the API key must never appear in a response');
});

// ---------------------------------------------------------------------------
//  Admin
// ---------------------------------------------------------------------------

test('admin endpoints reject anonymous and customer callers', async (t) => {
  if (skipWithoutDb(t)) return;

  const anonymous = await api('/api/admin/stats');
  assert.equal(anonymous.status, 401);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'demo@cineverse.dev', password: 'password123' },
  });
  assert.equal(login.status, 200);

  const asCustomer = await api('/api/admin/stats', { token: login.body.data.token });
  assert.equal(asCustomer.status, 403);
  assert.equal(asCustomer.body.error.code, 'ADMIN_REQUIRED');
});

test('admin can sign in and read the dashboard', async (t) => {
  if (skipWithoutDb(t)) return;

  const bad = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'nihas@cineverse.dev', password: 'wrong-password' },
  });
  assert.equal(bad.status, 401);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'nihas@cineverse.dev', password: 'admin123' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.role, 'admin');
  const { token } = login.body.data;

  const stats = await api('/api/admin/stats', { token });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.data.totals.movies >= 10);
  assert.ok(stats.body.data.totals.screens >= 5);
  assert.ok(stats.body.data.bookings.gross_revenue >= 0);
  assert.ok(Array.isArray(stats.body.data.recentBookings));

  const bookings = await api('/api/admin/bookings?limit=5', { token });
  assert.equal(bookings.status, 200);
  assert.ok(bookings.body.data.length > 0);
  assert.ok(bookings.body.data[0].bookingReference.startsWith('CV-'));

  const customers = await api('/api/admin/customers?limit=5', { token });
  assert.equal(customers.status, 200);
  assert.ok(customers.body.data.length > 0);
});

test('admin movie CRUD validates input and protects referenced movies', async (t) => {
  if (skipWithoutDb(t)) return;
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'nihas@cineverse.dev', password: 'admin123' },
  });
  const { token } = login.body.data;

  // Remove anything a previously interrupted run may have left behind.
  const testSlug = 'test-movie-for-suite';
  await query('DELETE FROM movies WHERE slug = :slug', { slug: testSlug });

  const invalid = await api('/api/admin/movies', {
    method: 'POST',
    token,
    body: { title: 'X', synopsis: 'too short', durationMinutes: 5, language: 'E', releaseDate: 'not-a-date' },
  });
  assert.equal(invalid.status, 400);

  const created = await api('/api/admin/movies', {
    method: 'POST',
    token,
    body: {
      title: 'Test Movie For Suite',
      synopsis: 'A temporary entry created by the integration test suite.',
      durationMinutes: 100,
      language: 'English',
      certificate: 'UA',
      rating: 7.5,
      releaseDate: '2026-11-01',
      status: 'upcoming',
      genres: ['drama'],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const movieId = created.body.data.id;

  const updated = await api(`/api/admin/movies/${movieId}`, {
    method: 'PUT',
    token,
    body: { title: 'Test Movie For Suite (updated)', rating: 8.2 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.rating, 8.2);

  // A movie with shows cannot be deleted.
  const seeded = await query('SELECT id FROM movies WHERE status = "now_showing" LIMIT 1');
  const blockedDelete = await api(`/api/admin/movies/${seeded[0].id}`, { method: 'DELETE', token });
  assert.equal(blockedDelete.status, 409);
  assert.equal(blockedDelete.body.error.code, 'MOVIE_IN_USE');

  const deleted = await api(`/api/admin/movies/${movieId}`, { method: 'DELETE', token });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
});
