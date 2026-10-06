import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import validate from '../middleware/validate.js';
import {
  listMovies, getFeaturedMovies, getMovieByIdOrSlug, getMovieStats,
  listGenres, listLanguages, listCities,
} from '../services/movieService.js';
import { listShowsForMovie, listDates } from '../services/showService.js';
import { showtimesQuery, movieIdParam, listMoviesQuery } from '../schemas/index.js';

const router = Router();

/**
 * @openapi
 * GET /api/movies
 * Filterable, sortable, paginated movie catalogue.
 */
router.get(
  '/',
  validate(listMoviesQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { featured, ...params } = req.query;
    const result = await listMovies({ ...params, featuredOnly: featured === 'true' });
    res.json(result);
  }),
);

/** GET /api/movies/featured — hero carousel on the home page. */
router.get(
  '/featured',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    res.json({ data: await getFeaturedMovies(limit) });
  }),
);

/**
 * GET /api/movies/:idOrSlug
 * Details plus the ratings/stats block shown on the movie page.
 */
router.get(
  '/:idOrSlug',
  validate(movieIdParam, 'params'),
  asyncHandler(async (req, res) => {
    const movie = await getMovieByIdOrSlug(req.params.idOrSlug);
    const stats = await getMovieStats(movie.id);
    res.json({ data: { ...movie, stats } });
  }),
);

/**
 * GET /api/movies/:idOrSlug/shows?date=YYYY-MM-DD&city=&theatreId=
 * Showtimes grouped by theatre for one date, with live availability.
 */
router.get(
  '/:idOrSlug/shows',
  validate(movieIdParam, 'params'),
  validate(showtimesQuery, 'query'),
  asyncHandler(async (req, res) => {
    const movie = await getMovieByIdOrSlug(req.params.idOrSlug);
    const [dates, listing] = await Promise.all([
      listDates(7),
      listShowsForMovie({ movieId: movie.id, ...req.query }),
    ]);
    res.json({
      data: {
        movie,
        date: listing.date,
        dates,
        theatres: listing.theatres,
      },
    });
  }),
);

export default router;
