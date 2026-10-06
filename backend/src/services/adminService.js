import { query, queryOne, queryWith, execute, withTransaction } from '../db/pool.js';
import ApiError from '../utils/errors.js';
import { slugify } from '../utils/ids.js';

/**
 * Administrator operations.
 *
 * Everything here is called from routes already protected by requireAdmin, and
 * every write that touches several tables runs inside a transaction.
 */

/** Base price per ticket tier, by screen technology. Mirrors database/seed.sql. */
export const SCREEN_TYPE_BASE_PRICES = {
  '2D': 150,
  '3D': 180,
  IMAX: 240,
  '4DX': 270,
  DOLBY_ATMOS: 210,
};

/** Tier multipliers applied to the screen base price. */
export const TIER_MULTIPLIERS = {
  CLASSIC: { multiplier: 1, label: 'Classic', colorHex: '#5b8def' },
  PREMIUM: { multiplier: 1.45, label: 'Premium', colorHex: '#a855f7' },
  RECLINER: { multiplier: 1.9, label: 'Recliner', colorHex: '#f5a524' },
};

const roundToTen = (value) => Math.round(value / 10) * 10;

// ---------------------------------------------------------------------------
//  Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardStats() {
  const [totals, today, bookingState, topMovies, recentBookings, occupancy, revenueByDay] = await Promise.all([
    queryOne(`
      SELECT
        (SELECT COUNT(*) FROM movies)                     AS movies,
        (SELECT COUNT(*) FROM movies WHERE status='now_showing') AS now_showing,
        (SELECT COUNT(*) FROM movies WHERE status='upcoming')    AS upcoming,
        (SELECT COUNT(*) FROM theatres WHERE is_active=1)  AS theatres,
        (SELECT COUNT(*) FROM screens  WHERE is_active=1)  AS screens,
        (SELECT COUNT(*) FROM seats)                       AS seats,
        (SELECT COUNT(*) FROM shows)                       AS shows,
        (SELECT COUNT(*) FROM users WHERE role='customer') AS customers`),
    queryOne(`
      SELECT
        (SELECT COUNT(*) FROM shows WHERE show_date = CURDATE()) AS shows_today,
        (SELECT COUNT(*) FROM bookings WHERE DATE(created_at) = CURDATE() AND status='CONFIRMED') AS bookings_today,
        (SELECT COALESCE(SUM(total_amount),0) FROM bookings
          WHERE DATE(created_at) = CURDATE() AND status='CONFIRMED') AS revenue_today,
        (SELECT COALESCE(SUM(b.total_amount),0) FROM bookings b
           JOIN shows sh ON sh.id = b.show_id
          WHERE sh.show_date = CURDATE() AND b.status='CONFIRMED') AS revenue_shows_today`),
    queryOne(`
      SELECT
        COALESCE(SUM(status='CONFIRMED'),0) AS confirmed,
        COALESCE(SUM(status='PENDING'),0)   AS pending,
        COALESCE(SUM(status='CANCELLED'),0) AS cancelled,
        COALESCE(SUM(status='EXPIRED'),0)   AS expired,
        COALESCE(SUM(CASE WHEN status='CONFIRMED' THEN total_amount ELSE 0 END),0) AS gross_revenue,
        COALESCE(SUM(CASE WHEN status='CONFIRMED' THEN seat_count ELSE 0 END),0)   AS tickets_sold
      FROM bookings`),
    query(`
      SELECT m.id, m.title, m.poster_url,
             COUNT(b.id)                       AS booking_count,
             COALESCE(SUM(b.seat_count),0)     AS seats_sold,
             COALESCE(SUM(b.total_amount),0)   AS revenue
        FROM movies m
        JOIN shows sh ON sh.movie_id = m.id
        JOIN bookings b ON b.show_id = sh.id AND b.status='CONFIRMED'
       GROUP BY m.id, m.title, m.poster_url
       ORDER BY revenue DESC
       LIMIT 5`),
    query(`
      SELECT b.booking_reference, b.status, b.seat_count, b.total_amount, b.created_at,
             b.customer_name, m.title AS movie_title, t.name AS theatre_name,
             sh.show_date, sh.start_time
        FROM bookings b
        JOIN shows sh ON sh.id = b.show_id
        JOIN movies m ON m.id = sh.movie_id
        JOIN screens sc ON sc.id = sh.screen_id
        JOIN theatres t ON t.id = sc.theatre_id
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT 8`),
    query(`SELECT movie_title, theatre_name, screen_name, start_time, total_seats, booked_seats, occupancy_percent
             FROM vw_show_occupancy
            WHERE show_date = CURDATE() AND show_status = 'scheduled'
            ORDER BY occupancy_percent DESC, start_time
            LIMIT 6`),
    query(`
      SELECT DATE(b.created_at) AS day,
             COUNT(*) AS bookings,
             COALESCE(SUM(b.total_amount),0) AS revenue,
             COALESCE(SUM(b.seat_count),0)   AS seats
        FROM bookings b
       WHERE b.status='CONFIRMED' AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(b.created_at)
       ORDER BY day`),
  ]);

  return {
    totals: {
      ...totals,
      bookings: bookingState.confirmed + bookingState.pending + bookingState.cancelled + bookingState.expired,
    },
    today,
    bookings: bookingState,
    topMovies,
    recentBookings,
    occupancyToday: occupancy,
    revenueByDay,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
//  Movies
// ---------------------------------------------------------------------------

const MOVIE_COLUMNS = [
  'title', 'slug', 'synopsis', 'duration_minutes', 'language', 'certificate', 'rating',
  'vote_count', 'director', 'cast_list', 'poster_url', 'backdrop_url', 'trailer_url',
  'release_date', 'status', 'is_featured',
];

async function replaceMovieGenres(connection, movieId, genreSlugs = []) {
  await connection.execute('DELETE FROM movie_genres WHERE movie_id = :movieId', { movieId });
  const slugs = [...new Set(genreSlugs.map((slug) => String(slug).toLowerCase().trim()).filter(Boolean))];
  if (!slugs.length) return;
  const placeholders = slugs.map(() => '?').join(',');
  const [genres] = await connection.execute(
    `SELECT id, slug FROM genres WHERE slug IN (${placeholders})`,
    slugs,
  );
  const unknown = slugs.filter((slug) => !genres.some((genre) => genre.slug === slug));
  if (unknown.length) {
    throw ApiError.badRequest(`Unknown genre(s): ${unknown.join(', ')}`, 'UNKNOWN_GENRE');
  }
  const values = genres.map(() => '(?, ?)').join(', ');
  const params = genres.flatMap((genre) => [movieId, genre.id]);
  await connection.execute(
    `INSERT INTO movie_genres (movie_id, genre_id) VALUES ${values}`,
    params,
  );
}

export async function createMovie(payload) {
  const movieId = await withTransaction(async (connection) => {
    const slug = payload.slug?.trim() || slugify(payload.title);
    const [existing] = await connection.execute('SELECT id FROM movies WHERE slug = :slug', { slug });
    if (existing.length) {
      throw ApiError.conflict(`A movie with the slug "${slug}" already exists`, 'SLUG_TAKEN');
    }

    const [result] = await connection.execute(
      `INSERT INTO movies (title, slug, synopsis, duration_minutes, language, certificate,
                           rating, vote_count, director, cast_list, poster_url, backdrop_url,
                           trailer_url, release_date, status, is_featured)
       VALUES (:title, :slug, :synopsis, :duration_minutes, :language, :certificate,
               :rating, :vote_count, :director, :cast_list, :posterUrl, :backdropUrl,
               :trailerUrl, :releaseDate, :status, :isFeatured)`,
      {
        title: payload.title,
        slug,
        synopsis: payload.synopsis,
        duration_minutes: payload.durationMinutes,
        language: payload.language,
        certificate: payload.certificate ?? 'UA',
        rating: payload.rating ?? 0,
        vote_count: payload.voteCount ?? 0,
        director: payload.director ?? null,
        cast_list: (payload.cast ?? []).join(', ') || null,
        posterUrl: payload.posterUrl ?? '/posters/placeholder.svg',
        backdropUrl: payload.backdropUrl ?? payload.posterUrl ?? '/posters/placeholder.svg',
        trailerUrl: payload.trailerUrl ?? null,
        releaseDate: payload.releaseDate,
        status: payload.status ?? 'now_showing',
        isFeatured: payload.isFeatured ? 1 : 0,
      },
    );
    await replaceMovieGenres(connection, result.insertId, payload.genres ?? []);
    return result.insertId;
  });
  // Read back outside the transaction: a pool connection cannot see a row that
  // has not been committed yet.
  return getAdminMovie(movieId);
}

export async function updateMovie(id, payload) {
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM movies WHERE id = :id FOR UPDATE', { id });
    const current = rows[0];
    if (!current) throw ApiError.notFound('That movie does not exist', 'MOVIE_NOT_FOUND');

    const next = {
      title: payload.title ?? current.title,
      slug: payload.slug ?? current.slug,
      synopsis: payload.synopsis ?? current.synopsis,
      duration_minutes: payload.durationMinutes ?? current.duration_minutes,
      language: payload.language ?? current.language,
      certificate: payload.certificate ?? current.certificate,
      rating: payload.rating ?? current.rating,
      vote_count: payload.voteCount ?? current.vote_count,
      director: payload.director ?? current.director,
      cast_list: payload.cast ? payload.cast.join(', ') : current.cast_list,
      posterUrl: payload.posterUrl ?? current.poster_url,
      backdropUrl: payload.backdropUrl ?? current.backdrop_url,
      trailerUrl: payload.trailerUrl ?? current.trailer_url,
      releaseDate: payload.releaseDate ?? current.release_date,
      status: payload.status ?? current.status,
      isFeatured: payload.isFeatured === undefined ? current.is_featured : (payload.isFeatured ? 1 : 0),
      id,
    };

    await connection.execute(
      `UPDATE movies SET
         title = :title, slug = :slug, synopsis = :synopsis, duration_minutes = :duration_minutes,
         language = :language, certificate = :certificate, rating = :rating, vote_count = :vote_count,
         director = :director, cast_list = :cast_list, poster_url = :posterUrl, backdrop_url = :backdropUrl,
         trailer_url = :trailerUrl, release_date = :releaseDate, status = :status, is_featured = :isFeatured
       WHERE id = :id`,
      next,
    );
    if (payload.genres) await replaceMovieGenres(connection, id, payload.genres);
  });
  return getAdminMovie(id);
}

export async function deleteMovie(id) {
  const shows = await queryOne('SELECT COUNT(*) AS total FROM shows WHERE movie_id = :id', { id });
  if (shows?.total) {
    throw ApiError.conflict(
      `This movie still has ${shows.total} scheduled show(s). Cancel or remove them first.`,
      'MOVIE_IN_USE',
      { shows: shows.total },
    );
  }
  const result = await execute('DELETE FROM movies WHERE id = :id', { id });
  if (!result.affectedRows) throw ApiError.notFound('That movie does not exist', 'MOVIE_NOT_FOUND');
  return { id, deleted: true };
}

export async function getAdminMovie(id) {
  const rows = await queryWith(null, 'SELECT * FROM movies WHERE id = :id', { id });
  const movie = rows[0];
  if (!movie) throw ApiError.notFound('That movie does not exist', 'MOVIE_NOT_FOUND');
  const genres = await query(
    `SELECT g.slug, g.name FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
      WHERE mg.movie_id = :id ORDER BY g.name`,
    { id },
  );
  return {
    ...movie,
    posterUrl: movie.poster_url,
    genres,
  };
}

export async function listAdminMovies({ search, status } = {}) {
  const where = [];
  const bindings = {};
  if (status) { where.push('m.status = :status'); bindings.status = status; }
  if (search) { where.push('m.title LIKE :search'); bindings.search = `%${search}%`; }
  const rows = await query(
    `SELECT m.*,
            (SELECT COUNT(*) FROM shows sh WHERE sh.movie_id = m.id) AS show_count,
            (SELECT COUNT(*) FROM movie_genres mg WHERE mg.movie_id = m.id) AS genre_count
       FROM movies m
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.created_at DESC, m.id DESC`,
    bindings,
  );
  return rows;
}

// ---------------------------------------------------------------------------
//  Theatres & screens
// ---------------------------------------------------------------------------

export async function listAdminTheatres() {
  return query(`
    SELECT t.*,
           (SELECT COUNT(*) FROM screens s WHERE s.theatre_id = t.id) AS screen_count,
           (SELECT COUNT(*) FROM shows sh
              JOIN screens s2 ON s2.id = sh.screen_id
             WHERE s2.theatre_id = t.id AND sh.show_date >= CURDATE()) AS upcoming_show_count
      FROM theatres t
     ORDER BY t.city, t.name`);
}

export async function createTheatre(payload) {
  const result = await execute(
    `INSERT INTO theatres (name, city, address, phone, amenities, rating, is_active)
     VALUES (:name, :city, :address, :phone, :amenities, :rating, 1)`,
    {
      name: payload.name,
      city: payload.city,
      address: payload.address,
      phone: payload.phone ?? null,
      amenities: (payload.amenities ?? []).join(', ') || null,
      rating: payload.rating ?? 4.0,
    },
  );
  return queryOne('SELECT * FROM theatres WHERE id = :id', { id: result.insertId });
}

export async function updateTheatre(id, payload) {
  const current = await queryOne('SELECT * FROM theatres WHERE id = :id', { id });
  if (!current) throw ApiError.notFound('That theatre does not exist', 'THEATRE_NOT_FOUND');
  await execute(
    `UPDATE theatres SET name = :name, city = :city, address = :address, phone = :phone,
            amenities = :amenities, rating = :rating, is_active = :isActive
      WHERE id = :id`,
    {
      id,
      name: payload.name ?? current.name,
      city: payload.city ?? current.city,
      address: payload.address ?? current.address,
      phone: payload.phone ?? current.phone,
      amenities: payload.amenities ? payload.amenities.join(', ') : current.amenities,
      rating: payload.rating ?? current.rating,
      isActive: payload.isActive === undefined ? current.is_active : (payload.isActive ? 1 : 0),
    },
  );
  return queryOne('SELECT * FROM theatres WHERE id = :id', { id });
}

export async function deleteTheatre(id) {
  const bookings = await queryOne(
    `SELECT COUNT(*) AS total
       FROM bookings b
       JOIN shows sh ON sh.id = b.show_id
       JOIN screens sc ON sc.id = sh.screen_id
      WHERE sc.theatre_id = :id`,
    { id },
  );
  if (bookings?.total) {
    throw ApiError.conflict(
      'This theatre has bookings against it and cannot be deleted. Deactivate it instead.',
      'THEATRE_IN_USE',
    );
  }
  const result = await execute('DELETE FROM theatres WHERE id = :id', { id });
  if (!result.affectedRows) throw ApiError.notFound('That theatre does not exist', 'THEATRE_NOT_FOUND');
  return { id, deleted: true };
}

export async function listAdminScreens(theatreId) {
  return query(
    `SELECT s.*, t.name AS theatre_name, t.city,
            (SELECT COUNT(*) FROM seats se WHERE se.screen_id = s.id) AS seat_count,
            (SELECT COUNT(*) FROM shows sh WHERE sh.screen_id = s.id AND sh.show_date >= CURDATE()) AS upcoming_shows
       FROM screens s
       JOIN theatres t ON t.id = s.theatre_id
      ${theatreId ? 'WHERE s.theatre_id = :theatreId' : ''}
      ORDER BY t.name, s.name`,
    theatreId ? { theatreId } : {},
  );
}

/**
 * Builds the physical seat grid for a screen: pricing tiers, rows and seats.
 * Shared by screen creation and the "rebuild layout" action - the same rules the
 * seed script uses, so a screen created in the admin panel behaves identically.
 */
export async function generateSeatLayout(connection, screenId, { screenType, totalRows, seatsPerRow }) {
  const basePrice = SCREEN_TYPE_BASE_PRICES[screenType] ?? SCREEN_TYPE_BASE_PRICES['2D'];

  await connection.execute('DELETE FROM screen_rows WHERE screen_id = :screenId', { screenId });
  await connection.execute('DELETE FROM seats WHERE screen_id = :screenId', { screenId });
  await connection.execute('DELETE FROM seat_categories WHERE screen_id = :screenId', { screenId });

  const tiers = Object.entries(TIER_MULTIPLIERS).map(([code, tier]) => ({
    code,
    label: tier.label,
    colorHex: tier.colorHex,
    price: roundToTen(basePrice * tier.multiplier),
  }));

  const categoryIds = {};
  for (const tier of tiers) {
    const [result] = await connection.execute(
      `INSERT INTO seat_categories (screen_id, code, label, base_price, color_hex)
       VALUES (:screenId, :code, :label, :price, :colorHex)`,
      { screenId, code: tier.code, label: tier.label, price: tier.price, colorHex: tier.colorHex },
    );
    categoryIds[tier.code] = result.insertId;
  }

  const classicBoundary = Math.ceil(totalRows * 0.35);
  const premiumBoundary = Math.max(classicBoundary, totalRows - 2);
  let seatCount = 0;

  for (let row = 1; row <= totalRows; row += 1) {
    const rowLabel = String.fromCharCode(64 + row);
    const code = row <= classicBoundary ? 'CLASSIC' : row <= premiumBoundary ? 'PREMIUM' : 'RECLINER';
    await connection.execute(
      `INSERT INTO screen_rows (screen_id, row_label, seat_count, category_id)
       VALUES (:screenId, :rowLabel, :seatCount, :categoryId)`,
      { screenId, rowLabel, seatCount: seatsPerRow, categoryId: categoryIds[code] },
    );
  }

  for (let row = 1; row <= totalRows; row += 1) {
    const rowLabel = String.fromCharCode(64 + row);
    const code = row <= classicBoundary ? 'CLASSIC' : row <= premiumBoundary ? 'PREMIUM' : 'RECLINER';
    // Seats are inserted one row at a time: mysql2 cannot bind an array of
    // parameter objects in a single INSERT, and 26 statements per screen is
    // negligible compared to the readability this keeps.
    for (let seat = 1; seat <= seatsPerRow; seat += 1) {
      await connection.execute(
        `INSERT INTO seats (screen_id, row_label, seat_number, category_id)
         VALUES (:screenId, :rowLabel, :seatNumber, :categoryId)`,
        { screenId, rowLabel, seatNumber: seat, categoryId: categoryIds[code] },
      );
      seatCount += 1;
    }
  }

  return { categories: tiers.length, rows: totalRows, seats: seatCount };
}

export async function createScreen(payload) {
  return withTransaction(async (connection) => {
    const [existing] = await connection.execute(
      'SELECT id FROM screens WHERE theatre_id = :theatreId AND name = :name',
      { theatreId: payload.theatreId, name: payload.name },
    );
    if (existing.length) {
      throw ApiError.conflict('That theatre already has a screen with this name', 'SCREEN_NAME_TAKEN');
    }

    const [result] = await connection.execute(
      `INSERT INTO screens (theatre_id, name, screen_type, total_rows, seats_per_row)
       VALUES (:theatreId, :name, :screenType, :totalRows, :seatsPerRow)`,
      {
        theatreId: payload.theatreId,
        name: payload.name,
        screenType: payload.screenType,
        totalRows: payload.totalRows,
        seatsPerRow: payload.seatsPerRow,
      },
    );
    const layout = await generateSeatLayout(connection, result.insertId, payload);
    return { id: result.insertId, ...layout };
  });
}

export async function updateScreen(id, payload) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM screens WHERE id = :id FOR UPDATE', { id });
    const current = rows[0];
    if (!current) throw ApiError.notFound('That screen does not exist', 'SCREEN_NOT_FOUND');

    const next = {
      id,
      name: payload.name ?? current.name,
      screenType: payload.screenType ?? current.screen_type,
      totalRows: payload.totalRows ?? current.total_rows,
      seatsPerRow: payload.seatsPerRow ?? current.seats_per_row,
      isActive: payload.isActive === undefined ? current.is_active : (payload.isActive ? 1 : 0),
    };

    const layoutChanged = next.totalRows !== current.total_rows
      || next.seatsPerRow !== current.seats_per_row
      || next.screenType !== current.screen_type;

    await connection.execute(
      `UPDATE screens SET name = :name, screen_type = :screenType, total_rows = :totalRows,
              seats_per_row = :seatsPerRow, is_active = :isActive
        WHERE id = :id`,
      next,
    );

    let layout = null;
    if (layoutChanged || payload.rebuildLayout) {
      // Rebuilding seats would orphan sold seats, so refuse while bookings exist.
      const [bookings] = await connection.execute(
        `SELECT COUNT(*) AS total FROM booking_seats bs
          JOIN shows sh ON sh.id = bs.show_id
         WHERE sh.screen_id = :id AND bs.status = 'CONFIRMED'`,
        { id },
      );
      if (bookings[0].total > 0) {
        throw ApiError.conflict(
          'This screen has active bookings. Cancel them before changing the seat layout.',
          'SCREEN_HAS_BOOKINGS',
        );
      }
      const [futureShows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM shows WHERE screen_id = :id AND show_date >= CURDATE() AND status = 'scheduled'`,
        { id },
      );
      if (futureShows[0].total > 0) {
        throw ApiError.conflict(
          'Remove or cancel this screen\'s upcoming shows before rebuilding its seat layout.',
          'SCREEN_HAS_SHOWS',
        );
      }
      layout = await generateSeatLayout(connection, id, next);
    }

    return { ...next, layout };
  });
}

export async function deleteScreen(id) {
  const bookings = await queryOne(
    `SELECT COUNT(*) AS total FROM booking_seats bs
      JOIN shows sh ON sh.id = bs.show_id WHERE sh.screen_id = :id AND bs.status='CONFIRMED'`,
    { id },
  );
  if (bookings?.total) {
    throw ApiError.conflict('This screen has bookings and cannot be deleted.', 'SCREEN_IN_USE');
  }
  const result = await execute('DELETE FROM screens WHERE id = :id', { id });
  if (!result.affectedRows) throw ApiError.notFound('That screen does not exist', 'SCREEN_NOT_FOUND');
  return { id, deleted: true };
}

// ---------------------------------------------------------------------------
//  Shows
// ---------------------------------------------------------------------------

function addMinutes(time, minutes) {
  const [hours, mins] = String(time).split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/**
 * Overlap detection for a screen on a date.
 * Two screenings clash when one starts before the other ends.
 */
async function assertNoOverlap(connection, { screenId, showDate, startTime, endTime, excludeShowId }) {
  const [rows] = await connection.execute(
    `SELECT id, start_time, end_time
       FROM shows
      WHERE screen_id = :screenId
        AND show_date = :showDate
        AND status <> 'cancelled'
        AND start_time < :endTime
        AND end_time > :startTime
        ${excludeShowId ? 'AND id <> :excludeShowId' : ''}`,
    { screenId, showDate, startTime, endTime, excludeShowId },
  );
  if (rows.length) {
    throw ApiError.conflict(
      `This screen is already busy from ${rows[0].start_time} to ${rows[0].end_time} on ${showDate}`,
      'SHOW_OVERLAP',
      { conflictShowId: rows[0].id },
    );
  }
}

function priceMultiplierFor(showDate, startTime, override) {
  if (override !== undefined && override !== null) return Number(override);
  const day = new Date(`${showDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;
  const isEvening = String(startTime) >= '18:00:00';
  if (isWeekend && isEvening) return 1.4;
  if (isWeekend) return 1.25;
  if (isEvening) return 1.2;
  return 1;
}

export async function createShow(payload) {
  const showId = await withTransaction(async (connection) => {
    const [movies] = await connection.execute(
      'SELECT id, duration_minutes, language FROM movies WHERE id = :movieId',
      { movieId: payload.movieId },
    );
    const movie = movies[0];
    if (!movie) throw ApiError.badRequest('Unknown movie', 'MOVIE_NOT_FOUND');

    const [screens] = await connection.execute(
      'SELECT id, name FROM screens WHERE id = :screenId',
      { screenId: payload.screenId },
    );
    if (!screens.length) throw ApiError.badRequest('Unknown screen', 'SCREEN_NOT_FOUND');

    const startTime = payload.startTime.length === 5 ? `${payload.startTime}:00` : payload.startTime;
    const endTime = addMinutes(startTime, movie.duration_minutes);
    if (endTime <= startTime) {
      throw ApiError.badRequest('This show would run past midnight. Pick an earlier start time.', 'SHOW_CROSSES_MIDNIGHT');
    }

    await assertNoOverlap(connection, {
      screenId: payload.screenId,
      showDate: payload.showDate,
      startTime,
      endTime,
    });

    const [result] = await connection.execute(
      `INSERT INTO shows (movie_id, screen_id, show_date, start_time, end_time, language, price_multiplier, status)
       VALUES (:movieId, :screenId, :showDate, :startTime, :endTime, :language, :priceMultiplier, 'scheduled')`,
      {
        movieId: payload.movieId,
        screenId: payload.screenId,
        showDate: payload.showDate,
        startTime,
        endTime,
        language: payload.language ?? movie.language,
        priceMultiplier: priceMultiplierFor(payload.showDate, startTime, payload.priceMultiplier),
      },
    );
    return result.insertId;
  });
  return queryOne('SELECT * FROM shows WHERE id = :id', { id: showId });
}

export async function updateShow(id, payload) {
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM shows WHERE id = :id FOR UPDATE', { id });
    const current = rows[0];
    if (!current) throw ApiError.notFound('That show does not exist', 'SHOW_NOT_FOUND');

    const movieId = payload.movieId ?? current.movie_id;
    const screenId = payload.screenId ?? current.screen_id;
    const showDate = payload.showDate ?? current.show_date;

    const [movies] = await connection.execute('SELECT duration_minutes FROM movies WHERE id = :movieId', { movieId });
    if (!movies.length) throw ApiError.badRequest('Unknown movie', 'MOVIE_NOT_FOUND');

    const rawStart = payload.startTime ?? current.start_time;
    const startTime = String(rawStart).length === 5 ? `${rawStart}:00` : String(rawStart);
    const endTime = addMinutes(startTime, movies[0].duration_minutes);

    await assertNoOverlap(connection, { screenId, showDate, startTime, endTime, excludeShowId: id });

    const bookedSeats = await queryOne(
      `SELECT COUNT(*) AS total FROM booking_seats WHERE show_id = :id AND status='CONFIRMED'`,
      { id },
    );
    if (payload.status === 'cancelled') {
      if (bookedSeats?.total) {
        throw ApiError.conflict(
          'This show has confirmed bookings. Cancel those bookings before cancelling the show.',
          'SHOW_HAS_BOOKINGS',
        );
      }
      await connection.execute(
        `UPDATE booking_seats SET status='EXPIRED' WHERE show_id = :id AND status='CONFIRMED'`,
        { id },
      );
    }

    await connection.execute(
      `UPDATE shows SET movie_id = :movieId, screen_id = :screenId, show_date = :showDate,
              start_time = :startTime, end_time = :endTime, language = :language,
              price_multiplier = :priceMultiplier, status = :status
        WHERE id = :id`,
      {
        id,
        movieId,
        screenId,
        showDate,
        startTime,
        endTime,
        language: payload.language ?? current.language,
        priceMultiplier: payload.priceMultiplier ?? current.price_multiplier,
        status: payload.status ?? current.status,
      },
    );
  });
  return queryOne('SELECT * FROM shows WHERE id = :id', { id });
}

export async function deleteShow(id) {
  const booked = await queryOne(
    `SELECT COUNT(*) AS total FROM booking_seats WHERE show_id = :id AND status='CONFIRMED'`,
    { id },
  );
  if (booked?.total) {
    throw ApiError.conflict(
      'This show has confirmed bookings and cannot be deleted. Cancel the show instead.',
      'SHOW_HAS_BOOKINGS',
    );
  }
  const result = await execute('DELETE FROM shows WHERE id = :id', { id });
  if (!result.affectedRows) throw ApiError.notFound('That show does not exist', 'SHOW_NOT_FOUND');
  return { id, deleted: true };
}

export async function listAdminShows({ movieId, theatreId, date, from, to, limit = 100 } = {}) {
  const where = [];
  const bindings = { limit: Number(limit) };
  if (movieId) { where.push('sh.movie_id = :movieId'); bindings.movieId = movieId; }
  if (theatreId) { where.push('sc.theatre_id = :theatreId'); bindings.theatreId = theatreId; }
  if (date) { where.push('sh.show_date = :date'); bindings.date = date; }
  if (from) { where.push('sh.show_date >= :from'); bindings.from = from; }
  if (to) { where.push('sh.show_date <= :to'); bindings.to = to; }

  return query(
    `SELECT sh.*, m.title AS movie_title, sc.name AS screen_name, t.name AS theatre_name, t.city,
            COALESCE(occ.booked_seats, 0) AS booked_seats,
            COALESCE(occ.total_seats, 0)  AS total_seats
       FROM shows sh
       JOIN movies  m  ON m.id  = sh.movie_id
       JOIN screens sc ON sc.id = sh.screen_id
       JOIN theatres t ON t.id  = sc.theatre_id
       LEFT JOIN vw_show_occupancy occ ON occ.show_id = sh.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sh.show_date DESC, sh.start_time DESC
      LIMIT :limit`,
    bindings,
  );
}

// ---------------------------------------------------------------------------
//  Bookings & customers
// ---------------------------------------------------------------------------

export async function listAdminBookings({
  status, search, date, movieId, limit = 25, page = 1,
} = {}) {
  const where = [];
  const bindings = {};
  if (status) { where.push('b.status = :status'); bindings.status = status; }
  if (date) { where.push('sh.show_date = :date'); bindings.date = date; }
  if (movieId) { where.push('sh.movie_id = :movieId'); bindings.movieId = movieId; }
  if (search) {
    where.push('(b.booking_reference LIKE :search OR b.customer_name LIKE :search OR b.customer_email LIKE :search)');
    bindings.search = `%${search}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total
       FROM bookings b
       JOIN shows sh ON sh.id = b.show_id
       ${whereSql}`,
    bindings,
  );

  const rows = await query(
    `SELECT b.id, b.booking_reference, b.status, b.seat_count, b.subtotal, b.convenience_fee,
            b.total_amount, b.currency, b.customer_name, b.customer_email, b.customer_phone,
            b.created_at, b.confirmed_at, b.cancelled_at, b.expires_at,
            sh.id AS show_id, sh.show_date, sh.start_time,
            m.id AS movie_id, m.title AS movie_title, m.poster_url,
            sc.name AS screen_name, t.name AS theatre_name, t.city,
            (SELECT GROUP_CONCAT(CONCAT(se.row_label, LPAD(se.seat_number, 2, '0'))
                     ORDER BY se.row_label, se.seat_number SEPARATOR ', ')
               FROM booking_seats bs JOIN seats se ON se.id = bs.seat_id
              WHERE bs.booking_id = b.id AND bs.status='CONFIRMED') AS seat_labels,
            (SELECT p.method FROM payments p WHERE p.booking_id = b.id ORDER BY p.id DESC LIMIT 1) AS payment_method,
            (SELECT p.status FROM payments p WHERE p.booking_id = b.id ORDER BY p.id DESC LIMIT 1) AS payment_status
       FROM bookings b
       JOIN shows  sh ON sh.id = b.show_id
       JOIN movies m  ON m.id  = sh.movie_id
       JOIN screens sc ON sc.id = sh.screen_id
       JOIN theatres t ON t.id  = sc.theatre_id
       ${whereSql}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT :limit OFFSET :offset`,
    { ...bindings, limit: Number(limit), offset: (Number(page) - 1) * Number(limit) },
  );

  return {
    data: rows.map((row) => ({
      id: row.id,
      bookingReference: row.booking_reference,
      status: row.status,
      seatCount: row.seat_count,
      seatLabels: row.seat_labels,
      subtotal: row.subtotal,
      convenienceFee: row.convenience_fee,
      totalAmount: row.total_amount,
      currency: row.currency,
      customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone },
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      cancelledAt: row.cancelled_at,
      expiresAt: row.expires_at,
      payment: { method: row.payment_method, status: row.payment_status },
      show: {
        id: row.show_id,
        showDate: row.show_date,
        startTime: row.start_time,
        screenName: row.screen_name,
        theatreName: row.theatre_name,
        city: row.city,
      },
      movie: { id: row.movie_id, title: row.movie_title, posterUrl: row.poster_url },
    })),
    meta: {
      page: Number(page),
      limit: Number(limit),
      total: totalRow?.total ?? 0,
      totalPages: Math.max(1, Math.ceil((totalRow?.total ?? 0) / Number(limit))),
    },
  };
}

export async function listCustomers({ search, limit = 50, page = 1 } = {}) {
  const bindings = { limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
  let whereSql = '';
  if (search) {
    whereSql = 'WHERE (u.full_name LIKE :search OR u.email LIKE :search OR u.phone LIKE :search)';
    bindings.search = `%${search}%`;
  }

  const rows = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.created_at,
            COUNT(b.id) AS booking_count,
            COALESCE(SUM(CASE WHEN b.status='CONFIRMED' THEN b.seat_count ELSE 0 END), 0) AS seats_booked,
            COALESCE(SUM(CASE WHEN b.status='CONFIRMED' THEN b.total_amount ELSE 0 END), 0) AS total_spend,
            MAX(b.created_at) AS last_booking_at
       FROM users u
       LEFT JOIN bookings b ON b.user_id = u.id
       ${whereSql}
      GROUP BY u.id, u.full_name, u.email, u.phone, u.role, u.created_at
      ORDER BY total_spend DESC, u.created_at DESC
      LIMIT :limit OFFSET :offset`,
    bindings,
  );

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM users u ${search ? 'WHERE (u.full_name LIKE :search OR u.email LIKE :search OR u.phone LIKE :search)' : ''}`,
    search ? { search: `%${search}%` } : {},
  );

  return {
    data: rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      createdAt: row.created_at,
      bookingCount: row.booking_count,
      seatsBooked: row.seats_booked,
      totalSpend: row.total_spend,
      lastBookingAt: row.last_booking_at,
    })),
    meta: {
      page: Number(page),
      limit: Number(limit),
      total: totalRow?.total ?? 0,
      totalPages: Math.max(1, Math.ceil((totalRow?.total ?? 0) / Number(limit))),
    },
  };
}

export async function getCustomerProfile(id) {
  const customer = await queryOne(
    `SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = :id`,
    { id },
  );
  if (!customer) throw ApiError.notFound('That customer does not exist', 'CUSTOMER_NOT_FOUND');

  const bookings = await query(
    `SELECT b.booking_reference, b.status, b.seat_count, b.total_amount, b.created_at,
            m.title AS movie_title, t.name AS theatre_name, sh.show_date, sh.start_time
       FROM bookings b
       JOIN shows sh ON sh.id = b.show_id
       JOIN movies m ON m.id = sh.movie_id
       JOIN screens sc ON sc.id = sh.screen_id
       JOIN theatres t ON t.id = sc.theatre_id
      WHERE b.user_id = :id
      ORDER BY b.created_at DESC
      LIMIT 50`,
    { id },
  );

  return { customer, bookings };
}

export async function listGenresAdmin() {
  return query('SELECT id, name, slug FROM genres ORDER BY name');
}

export default {
  getDashboardStats,
  createMovie,
  updateMovie,
  deleteMovie,
  getAdminMovie,
  listAdminMovies,
  listAdminTheatres,
  createTheatre,
  updateTheatre,
  deleteTheatre,
  listAdminScreens,
  createScreen,
  updateScreen,
  deleteScreen,
  createShow,
  updateShow,
  deleteShow,
  listAdminShows,
  listAdminBookings,
  listCustomers,
  getCustomerProfile,
  listGenresAdmin,
  SCREEN_TYPE_BASE_PRICES,
  TIER_MULTIPLIERS,
};
