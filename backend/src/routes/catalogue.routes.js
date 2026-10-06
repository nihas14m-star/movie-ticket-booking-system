import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import validate from '../middleware/validate.js';
import { query } from '../db/pool.js';
import { listGenres, listLanguages, listCities } from '../services/movieService.js';
import { getShowById } from '../services/showService.js';
import { getSeatMap } from '../services/seatService.js';
import { showIdParam } from '../schemas/index.js';

const router = Router();

// ---------------------------------------------------------------------------
//  Lookup / metadata
// ---------------------------------------------------------------------------

/** GET /api/genres — used by the genre filter chips. */
router.get(
  '/genres',
  asyncHandler(async (_req, res) => {
    const rows = await listGenres();
    res.json({
      data: rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, movieCount: row.movie_count })),
    });
  }),
);

/** GET /api/languages */
router.get(
  '/languages',
  asyncHandler(async (_req, res) => {
    const rows = await listLanguages();
    res.json({ data: rows.map((row) => ({ language: row.language, movieCount: row.movie_count })) });
  }),
);

/** GET /api/cities — cities that have active theatres. */
router.get(
  '/cities',
  asyncHandler(async (_req, res) => {
    const rows = await listCities();
    res.json({
      data: rows.map((row) => ({
        city: row.city,
        theatreCount: row.theatre_count,
        screenCount: row.screen_count,
      })),
    });
  }),
);

/**
 * GET /api/theatres?city=
 * Theatres with their screens, used on the "select theatre" step.
 */
router.get(
  '/theatres',
  asyncHandler(async (req, res) => {
    const where = ['t.is_active = 1'];
    const bindings = {};
    if (req.query.city) {
      where.push('t.city = :city');
      bindings.city = req.query.city;
    }
    const theatres = await query(
      `SELECT t.id, t.name, t.city, t.address, t.phone, t.amenities, t.rating
         FROM theatres t
        WHERE ${where.join(' AND ')}
        ORDER BY t.city, t.name`,
      bindings,
    );
    const screens = await query(
      `SELECT s.id, s.theatre_id, s.name, s.screen_type, s.total_rows, s.seats_per_row,
              (SELECT COUNT(*) FROM seats se WHERE se.screen_id = s.id) AS seat_count
         FROM screens s
         JOIN theatres t ON t.id = s.theatre_id
        WHERE t.is_active = 1 AND s.is_active = 1
        ORDER BY s.name`,
    );

    res.json({
      data: theatres.map((theatre) => ({
        id: theatre.id,
        name: theatre.name,
        city: theatre.city,
        address: theatre.address,
        phone: theatre.phone,
        rating: theatre.rating,
        amenities: theatre.amenities ? theatre.amenities.split(',').map((item) => item.trim()) : [],
        screens: screens
          .filter((screen) => screen.theatre_id === theatre.id)
          .map((screen) => ({
            id: screen.id,
            name: screen.name,
            screenType: screen.screen_type,
            totalRows: screen.total_rows,
            seatsPerRow: screen.seats_per_row,
            seatCount: screen.seat_count,
          })),
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
//  Show + seat map
// ---------------------------------------------------------------------------

/** GET /api/shows/:id — one screening with movie, theatre and screen. */
router.get(
  '/shows/:id',
  validate(showIdParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await getShowById(req.params.id) });
  }),
);

/**
 * GET /api/shows/:id/seats
 * The full hall layout: rows, categories, per-seat status and pricing.
 */
router.get(
  '/shows/:id/seats',
  validate(showIdParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await getSeatMap(req.params.id) });
  }),
);

export default router;
