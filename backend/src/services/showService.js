import { query, queryOne, callProcedure } from '../db/pool.js';
import ApiError from '../utils/errors.js';
import { mapMovie, attachGenres } from './movieService.js';

/**
 * Screenings (shows) — the bridge between a movie and a physical screen.
 *
 * Availability always comes from the database (vw_show_occupancy) so the number
 * shown on the "select a show" screen can never disagree with the seat map.
 */

const OCCUPANCY_SQL = `
  SELECT show_id, total_seats, booked_seats, available_seats, occupancy_percent, show_status
    FROM vw_show_occupancy`;

const PRICE_FROM_SQL = `
  SELECT sh.id AS show_id,
         MIN(sc.base_price * sh.price_multiplier) AS price_from,
         MAX(sc.base_price * sh.price_multiplier) AS price_to
    FROM shows sh
    JOIN seat_categories sc ON sc.screen_id = sh.screen_id
   WHERE sh.id IN (__IDS__)
   GROUP BY sh.id`;

/** The database's idea of "today" keeps the API and the seed data in sync. */
export async function getToday() {
  const row = await queryOne('SELECT CURDATE() AS today');
  return row.today;
}

/** A rolling window of bookable dates starting today. */
export async function listDates(days = 7) {
  const today = await getToday();
  const rows = await query(
    `WITH RECURSIVE seq AS (
       SELECT 0 AS d UNION ALL SELECT d + 1 FROM seq WHERE d < :maxDays
     )
     SELECT DATE_FORMAT(DATE_ADD(:today, INTERVAL d DAY), '%Y-%m-%d') AS date, d
       FROM seq`,
    { maxDays: days - 1, today },
  );
  return rows.map((row, index) => ({ date: row.date, offset: index, isToday: index === 0 }));
}

/** Occupancy + pricing for a list of show ids, merged in two round trips. */
async function decorateShows(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');

  const [occupancy, prices] = await Promise.all([
    query(`${OCCUPANCY_SQL} WHERE show_id IN (${placeholders})`, ids),
    query(PRICE_FROM_SQL.replace('__IDS__', placeholders), ids),
  ]);

  const occupancyByShow = new Map(occupancy.map((row) => [row.show_id, row]));
  const priceByShow = new Map(prices.map((row) => [row.show_id, row]));

  return rows.map((row) => {
    const stats = occupancyByShow.get(row.id) ?? {};
    const price = priceByShow.get(row.id) ?? {};
    return {
      id: row.id,
      movieId: row.movie_id,
      screenId: row.screen_id,
      theatreId: row.theatre_id,
      showDate: row.show_date,
      startTime: row.start_time,
      endTime: row.end_time,
      language: row.language,
      priceMultiplier: row.price_multiplier,
      status: row.status,
      screenName: row.screen_name,
      screenType: row.screen_type,
      theatreName: row.theatre_name,
      city: row.city,
      priceFrom: price.price_from ?? null,
      priceTo: price.price_to ?? null,
      totalSeats: stats.total_seats ?? 0,
      bookedSeats: stats.booked_seats ?? 0,
      availableSeats: stats.available_seats ?? 0,
      occupancyPercent: stats.occupancy_percent ?? 0,
      isSoldOut: (stats.available_seats ?? 0) === 0,
    };
  });
}

const SHOW_SELECT = `
  SELECT sh.id, sh.movie_id, sh.screen_id, sh.show_date, sh.start_time, sh.end_time,
         sh.language, sh.price_multiplier, sh.status,
         sc.name AS screen_name, sc.screen_type, sc.theatre_id,
         t.name AS theatre_name, t.city
    FROM shows sh
    JOIN screens  sc ON sc.id = sh.screen_id
    JOIN theatres t  ON t.id = sc.theatre_id`;

/**
 * Screenings for one movie on one date, grouped by theatre for the UI.
 */
export async function listShowsForMovie({ movieId, date, city, theatreId } = {}) {
  const today = await getToday();
  const targetDate = date ?? today;

  const where = ['sh.movie_id = :movieId', 'sh.status = :status', 'sh.show_date = :date'];
  const bindings = { movieId, status: 'scheduled', date: targetDate };

  if (city) {
    where.push('t.city = :city');
    bindings.city = city;
  }
  if (theatreId) {
    where.push('t.id = :theatreId');
    bindings.theatreId = theatreId;
  }
  // Hide screenings that have already started today.
  if (targetDate === today) {
    where.push('sh.start_time > CURTIME()');
  }
  where.push('t.is_active = 1');

  const rows = await query(
    `${SHOW_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.name, sh.start_time`,
    bindings,
  );
  const shows = await decorateShows(rows);

  // Group by theatre, keeping the theatres ordered by their first show.
  const theatres = new Map();
  for (const show of shows) {
    if (!theatres.has(show.theatreId)) {
      theatres.set(show.theatreId, {
        id: show.theatreId,
        name: show.theatreName,
        city: show.city,
        screens: new Set(),
        shows: [],
      });
    }
    const theatre = theatres.get(show.theatreId);
    theatre.screens.add(show.screenName);
    theatre.shows.push(show);
  }

  const theatreRows = theatres.size
    ? await query(
      `SELECT id, name, city, address, phone, amenities, rating
         FROM theatres WHERE id IN (${[...theatres.keys()].map(() => '?').join(',')})`,
      [...theatres.keys()],
    )
    : [];
  const theatreMeta = new Map(theatreRows.map((row) => [row.id, row]));

  return {
    movieId,
    date: targetDate,
    theatres: [...theatres.values()].map((theatre) => {
      const meta = theatreMeta.get(theatre.id) ?? {};
      return {
        id: theatre.id,
        name: theatre.name,
        city: theatre.city,
        address: meta.address ?? null,
        phone: meta.phone ?? null,
        rating: meta.rating ?? null,
        amenities: meta.amenities ? meta.amenities.split(',').map((item) => item.trim()) : [],
        screens: [...theatre.screens],
        shows: theatre.shows,
      };
    }),
  };
}

/** Full detail for one screening, including movie and theatre. */
export async function getShowById(id) {
  const row = await queryOne(`${SHOW_SELECT} WHERE sh.id = :id`, { id });
  if (!row) throw ApiError.notFound('That show does not exist', 'SHOW_NOT_FOUND');

  const [show] = await decorateShows([row]);
  const movieRow = await queryOne('SELECT * FROM movies WHERE id = :id', { id: row.movie_id });
  const [movie] = movieRow ? await attachGenres([movieRow]) : [];
  const theatre = await queryOne('SELECT * FROM theatres WHERE id = :id', { id: row.theatre_id });
  const screen = await queryOne(
    `SELECT s.*, t.name AS theatre_name FROM screens s JOIN theatres t ON t.id = s.theatre_id WHERE s.id = :id`,
    { id: row.screen_id },
  );

  return {
    ...show,
    movie: movie ? mapMovie(movie) : null,
    theatre: theatre
      ? {
        id: theatre.id,
        name: theatre.name,
        city: theatre.city,
        address: theatre.address,
        phone: theatre.phone,
        rating: theatre.rating,
        amenities: theatre.amenities ? theatre.amenities.split(',').map((item) => item.trim()) : [],
      }
      : null,
    screen: screen
      ? {
        id: screen.id,
        name: screen.name,
        screenType: screen.screen_type,
        totalRows: screen.total_rows,
        seatsPerRow: screen.seats_per_row,
      }
      : null,
  };
}

/** Raw show row used by the booking transaction (includes movie duration). */
export async function getShowForBooking(showId, connection = null) {
  const sql = `
    SELECT sh.id, sh.movie_id, sh.screen_id, sh.show_date, sh.start_time, sh.end_time,
           sh.language, sh.price_multiplier, sh.status,
           m.title AS movie_title, m.duration_minutes, m.certificate,
           sc.name AS screen_name, sc.screen_type,
           t.id AS theatre_id, t.name AS theatre_name, t.city, t.address
      FROM shows sh
      JOIN movies   m  ON m.id  = sh.movie_id
      JOIN screens  sc ON sc.id = sh.screen_id
      JOIN theatres t  ON t.id  = sc.theatre_id
     WHERE sh.id = :showId`;
  if (connection) {
    const [rows] = await connection.execute(sql, { showId });
    return rows[0] ?? null;
  }
  return queryOne(sql, { showId });
}

/** Releases expired seat holds; called before availability reads and bookings. */
export async function releaseExpiredHolds() {
  try {
    const resultSets = await callProcedure('sp_release_expired_holds');
    const released = Array.isArray(resultSets?.[0]) ? resultSets[0][0]?.released_seat_lines : undefined;
    return released ?? 0;
  } catch {
    // Never let housekeeping break a read path.
    return 0;
  }
}

export default {
  getToday,
  listDates,
  listShowsForMovie,
  getShowById,
  getShowForBooking,
  releaseExpiredHolds,
};
