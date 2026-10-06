import { query, queryOne } from '../db/pool.js';
import ApiError from '../utils/errors.js';

/**
 * Movie catalogue reads.
 *
 * Every response is shaped here (snake_case columns -> camelCase API fields) so
 * routes stay thin and the frontend never sees database column names.
 */

const SORTS = {
  rating: 'm.rating DESC, m.vote_count DESC',
  newest: 'm.release_date DESC, m.id DESC',
  oldest: 'm.release_date ASC, m.id ASC',
  title: 'm.title ASC',
  popular: 'm.vote_count DESC, m.rating DESC',
};

/** Upcoming-screening count, used on cards as "3 shows today". */
const UPCOMING_SHOW_COUNT = `
  (SELECT COUNT(*)
     FROM shows sh
     JOIN screens sc ON sc.id = sh.screen_id
     JOIN theatres t  ON t.id = sc.theatre_id
    WHERE sh.movie_id = m.id
      AND sh.status = 'scheduled'
      AND (sh.show_date > CURDATE() OR (sh.show_date = CURDATE() AND sh.start_time >= CURTIME())))`;

/**
 * Map a movie row to the API shape. Genres live on the row itself (attached by
 * attachGenres) so there is exactly one source of truth for them.
 */
export function mapMovie(row) {
  const genres = Array.isArray(row.genres) ? row.genres : [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    synopsis: row.synopsis,
    durationMinutes: row.duration_minutes,
    durationLabel: formatDuration(row.duration_minutes),
    language: row.language,
    certificate: row.certificate,
    rating: row.rating,
    voteCount: row.vote_count,
    director: row.director,
    cast: row.cast_list ? row.cast_list.split(',').map((name) => name.trim()).filter(Boolean) : [],
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url ?? row.poster_url,
    trailerUrl: row.trailer_url,
    releaseDate: row.release_date,
    status: row.status,
    isFeatured: Boolean(row.is_featured),
    genres,
    upcomingShowCount: row.upcoming_show_count ?? undefined,
  };
}

export function formatDuration(minutes) {
  const safe = Number(minutes) || 0;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

/** Loads genres for a set of movie ids in a single round trip. */
export async function attachGenres(movies) {
  if (!movies.length) return movies;
  const ids = movies.map((movie) => movie.id);
  const rows = await query(
    `SELECT mg.movie_id, g.name, g.slug
       FROM movie_genres mg
       JOIN genres g ON g.id = mg.genre_id
      WHERE mg.movie_id IN (${ids.map(() => '?').join(',')})
      ORDER BY g.name`,
    ids,
  );
  const byMovie = new Map();
  for (const row of rows) {
    if (!byMovie.has(row.movie_id)) byMovie.set(row.movie_id, []);
    byMovie.get(row.movie_id).push({ name: row.name, slug: row.slug });
  }
  return movies.map((movie) => ({ ...movie, genres: byMovie.get(movie.id) ?? [] }));
}

/**
 * Paginated movie listing.
 * @param {object} params validated query parameters
 */
export async function listMovies(params = {}) {
  const {
    status, genre, genres, search, language, city, certificate, maxDurationMinutes,
    minDurationMinutes, sort = 'popular', page = 1, limit = 12, featuredOnly = false,
  } = params;

  const where = [];
  const bindings = {};

  // `genres` is the OR form (used by the AI search), `genre` the single-slug form.
  const genreList = (Array.isArray(genres) ? genres : []).filter(Boolean);
  if (genreList.length) {
    genreList.forEach((slug, index) => { bindings[`genre${index}`] = String(slug).toLowerCase(); });
    where.push(`EXISTS (
      SELECT 1 FROM movie_genres mg
        JOIN genres g ON g.id = mg.genre_id
       WHERE mg.movie_id = m.id
         AND g.slug IN (${genreList.map((_, index) => `:genre${index}`).join(', ')}))`);
  }
  if (certificate) {
    where.push('m.certificate = :certificate');
    bindings.certificate = certificate;
  }
  if (maxDurationMinutes) {
    where.push('m.duration_minutes <= :maxDurationMinutes');
    bindings.maxDurationMinutes = Number(maxDurationMinutes);
  }
  if (minDurationMinutes) {
    where.push('m.duration_minutes >= :minDurationMinutes');
    bindings.minDurationMinutes = Number(minDurationMinutes);
  }

  if (status) {
    where.push('m.status = :status');
    bindings.status = status;
  }
  if (language) {
    where.push('m.language = :language');
    bindings.language = language;
  }
  if (featuredOnly) where.push('m.is_featured = 1');
  if (genre) {
    where.push(`EXISTS (
      SELECT 1 FROM movie_genres mg
        JOIN genres g ON g.id = mg.genre_id
       WHERE mg.movie_id = m.id AND g.slug = :genre)`);
    bindings.genre = genre;
  }
  if (city) {
    where.push(`EXISTS (
      SELECT 1 FROM shows sh
        JOIN screens sc ON sc.id = sh.screen_id
        JOIN theatres t  ON t.id = sc.theatre_id
       WHERE sh.movie_id = m.id AND t.city = :city AND sh.status = 'scheduled')`);
    bindings.city = city;
  }
  if (search) {
    // FULLTEXT handles whole words and prefixes; LIKE covers short queries and
    // partial words inside a title (FULLTEXT ignores tokens under 3 chars).
    bindings.booleanTerm = search
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .map((token) => `${token.replace(/[+\-<>()~*"@]/g, '')}*`)
      .join(' ');
    bindings.likeTerm = `%${search}%`;
    where.push(`(
      (:booleanTerm <> '' AND MATCH(m.title, m.synopsis, m.director, m.cast_list)
        AGAINST (:booleanTerm IN BOOLEAN MODE))
      OR m.title LIKE :likeTerm
      OR m.director LIKE :likeTerm
      OR m.cast_list LIKE :likeTerm
      OR m.language LIKE :likeTerm
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SORTS[sort] ?? SORTS.popular;
  const offset = (page - 1) * limit;

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM movies m ${whereSql}`,
    bindings,
  );
  const total = totalRow?.total ?? 0;

  const rows = await query(
    `SELECT m.*, ${UPCOMING_SHOW_COUNT} AS upcoming_show_count
       FROM movies m
       ${whereSql}
       ORDER BY ${orderSql}
       LIMIT :limit OFFSET :offset`,
    { ...bindings, limit: Number(limit), offset: Number(offset) },
  );

  const movies = (await attachGenres(rows)).map((row) => mapMovie(row));

  return {
    data: movies,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      sort,
    },
  };
}

export async function getFeaturedMovies(limit = 5) {
  const rows = await query(
    `SELECT m.*, ${UPCOMING_SHOW_COUNT} AS upcoming_show_count
       FROM movies m
      WHERE m.is_featured = 1
      ORDER BY (m.status = 'now_showing') DESC, m.rating DESC
      LIMIT :limit`,
    { limit: Number(limit) },
  );
  return (await attachGenres(rows)).map((row) => mapMovie(row));
}

/** Accepts a numeric id or a slug. */
export async function getMovieByIdOrSlug(idOrSlug) {
  const isNumeric = /^\d+$/.test(String(idOrSlug));
  const row = await queryOne(
    `SELECT m.*, ${UPCOMING_SHOW_COUNT} AS upcoming_show_count
       FROM movies m
      WHERE ${isNumeric ? 'm.id = :value' : 'm.slug = :value'}
      LIMIT 1`,
    { value: isNumeric ? Number(idOrSlug) : String(idOrSlug) },
  );
  if (!row) throw ApiError.notFound('That movie does not exist', 'MOVIE_NOT_FOUND');
  const [withGenres] = await attachGenres([row]);
  return mapMovie(withGenres);
}

/** Ratings histogram + counts, used on the movie details page. */
export async function getMovieStats(movieId) {
  const [bookings, revenue] = await Promise.all([
    queryOne(
      `SELECT COUNT(*) AS tickets, COALESCE(SUM(b.seat_count), 0) AS seats
         FROM bookings b
         JOIN shows sh ON sh.id = b.show_id
        WHERE sh.movie_id = :movieId AND b.status = 'CONFIRMED'`,
      { movieId },
    ),
    queryOne(
      `SELECT COALESCE(SUM(b.total_amount), 0) AS revenue
         FROM bookings b
         JOIN shows sh ON sh.id = b.show_id
        WHERE sh.movie_id = :movieId AND b.status = 'CONFIRMED'`,
      { movieId },
    ),
  ]);
  return {
    ticketsSold: bookings?.seats ?? 0,
    bookingCount: bookings?.tickets ?? 0,
    revenue: revenue?.revenue ?? 0,
  };
}

/**
 * Full movie rows for a set of ids, in the same shape as listMovies.
 * Used to re-hydrate AI picks from the database (never from model output).
 */
export async function getMoviesByIds(ids = []) {
  const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!unique.length) return [];
  const rows = await query(
    `SELECT m.*, ${UPCOMING_SHOW_COUNT} AS upcoming_show_count
       FROM movies m
      WHERE m.id IN (${unique.map(() => '?').join(',')})
      ORDER BY FIELD(m.id, ${unique.map(() => '?').join(',')})`,
    [...unique, ...unique],
  );
  return (await attachGenres(rows)).map((row) => mapMovie(row));
}

export async function listGenres() {
  return query(
    `SELECT g.id, g.name, g.slug, COUNT(mg.movie_id) AS movie_count
       FROM genres g
       LEFT JOIN movie_genres mg ON mg.genre_id = g.id
      GROUP BY g.id, g.name, g.slug
      HAVING movie_count > 0
      ORDER BY g.name`,
  );
}

export async function listLanguages() {
  return query(
    `SELECT language, COUNT(*) AS movie_count
       FROM movies
      GROUP BY language
      ORDER BY movie_count DESC, language`,
  );
}

export async function listCities() {
  return query(
    `SELECT t.city,
            COUNT(DISTINCT t.id) AS theatre_count,
            COUNT(DISTINCT sc.id) AS screen_count
       FROM theatres t
       LEFT JOIN screens sc ON sc.theatre_id = t.id AND sc.is_active = 1
      WHERE t.is_active = 1
      GROUP BY t.city
      ORDER BY t.city`,
  );
}

export default {
  attachGenres,
  listMovies,
  getFeaturedMovies,
  getMovieByIdOrSlug,
  getMoviesByIds,
  getMovieStats,
  listGenres,
  listLanguages,
  listCities,
  mapMovie,
  formatDuration,
};
