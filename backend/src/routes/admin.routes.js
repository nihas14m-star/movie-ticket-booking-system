import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import validate from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  idParam, adminListQuery, movieBody, movieUpdateBody, theatreBody, theatreUpdateBody,
  screenBody, screenUpdateBody, showBody, showUpdateBody,
} from '../schemas/index.js';
import * as admin from '../services/adminService.js';

/**
 * Admin API. Every route below requires a bearer token whose role is `admin`
 * (see middleware/auth.js). Denials return 403 ADMIN_REQUIRED.
 */
const router = Router();

router.use(requireAdmin);

// ---------------------------------------------------------------------------
//  Dashboard
// ---------------------------------------------------------------------------
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json({ data: await admin.getDashboardStats() });
  }),
);

// ---------------------------------------------------------------------------
//  Movies
// ---------------------------------------------------------------------------
router.get(
  '/movies',
  validate(adminListQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.listAdminMovies(req.query) });
  }),
);

router.get(
  '/genres',
  asyncHandler(async (_req, res) => {
    res.json({ data: await admin.listGenresAdmin() });
  }),
);

router.get(
  '/movies/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.getAdminMovie(req.params.id) });
  }),
);

router.post(
  '/movies',
  validate(movieBody),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await admin.createMovie(req.body) });
  }),
);

router.put(
  '/movies/:id',
  validate(idParam, 'params'),
  validate(movieUpdateBody),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.updateMovie(req.params.id, req.body) });
  }),
);

router.delete(
  '/movies/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.deleteMovie(req.params.id) });
  }),
);

// ---------------------------------------------------------------------------
//  Theatres & screens
// ---------------------------------------------------------------------------
router.get(
  '/theatres',
  asyncHandler(async (_req, res) => {
    res.json({ data: await admin.listAdminTheatres() });
  }),
);

router.post(
  '/theatres',
  validate(theatreBody),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await admin.createTheatre(req.body) });
  }),
);

router.put(
  '/theatres/:id',
  validate(idParam, 'params'),
  validate(theatreUpdateBody),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.updateTheatre(req.params.id, req.body) });
  }),
);

router.delete(
  '/theatres/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.deleteTheatre(req.params.id) });
  }),
);

router.get(
  '/screens',
  validate(adminListQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.listAdminScreens(req.query.theatreId) });
  }),
);

router.post(
  '/screens',
  validate(screenBody),
  asyncHandler(async (req, res) => {
    // Creating a screen also generates its pricing tiers, rows and seat grid.
    res.status(201).json({ data: await admin.createScreen(req.body) });
  }),
);

router.put(
  '/screens/:id',
  validate(idParam, 'params'),
  validate(screenUpdateBody),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.updateScreen(req.params.id, req.body) });
  }),
);

router.delete(
  '/screens/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.deleteScreen(req.params.id) });
  }),
);

// ---------------------------------------------------------------------------
//  Shows
// ---------------------------------------------------------------------------
router.get(
  '/shows',
  validate(adminListQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.listAdminShows(req.query) });
  }),
);

router.post(
  '/shows',
  validate(showBody),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await admin.createShow(req.body) });
  }),
);

router.put(
  '/shows/:id',
  validate(idParam, 'params'),
  validate(showUpdateBody),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.updateShow(req.params.id, req.body) });
  }),
);

router.delete(
  '/shows/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.deleteShow(req.params.id) });
  }),
);

// ---------------------------------------------------------------------------
//  Bookings & customers
// ---------------------------------------------------------------------------
router.get(
  '/bookings',
  validate(adminListQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await admin.listAdminBookings(req.query));
  }),
);

router.get(
  '/customers',
  validate(adminListQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await admin.listCustomers(req.query));
  }),
);

router.get(
  '/customers/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await admin.getCustomerProfile(req.params.id) });
  }),
);

export default router;
