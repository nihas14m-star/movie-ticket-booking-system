import { Router } from 'express';
import moviesRoutes from './movies.routes.js';
import catalogueRoutes from './catalogue.routes.js';
import bookingsRoutes from './bookings.routes.js';
import authRoutes from './auth.routes.js';
import aiRoutes from './ai.routes.js';
import adminRoutes from './admin.routes.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ping, tableCount } from '../db/pool.js';
import env, { aiConfigured } from '../config/env.js';

/**
 * API surface (all under /api).
 *
 *  /health                      service + database + AI status
 *  /movies                      catalogue, details, showtimes for a movie
 *  /genres /languages /cities   filter metadata
 *  /theatres                    theatres with their screens
 *  /shows/:id                   one screening
 *  /shows/:id/seats             seat map with live availability
 *  /bookings                    create / pay / cancel / look up
 *  /auth                        login, register, me
 *  /ai                          recommendations, natural-language search, assistant
 *  /admin                       everything behind an admin token
 */
const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    let database = { connected: false, tables: 0, latencyMs: null };
    try {
      await ping();
      database = { connected: true, tables: await tableCount(), latencyMs: Date.now() - started };
    } catch (error) {
      database.error = error.code ?? error.message;
    }

    const ai = { enabled: aiConfigured(), model: aiConfigured() ? env.ai.model : null };

    // 13 tables is the full schema; anything less means schema.sql has not run.
    const schemaReady = database.connected && database.tables >= 13;

    res.status(schemaReady ? 200 : 503).json({
      status: schemaReady ? 'ok' : 'degraded',
      service: 'cineverse-api',
      version: '1.0.0',
      environment: env.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      database: { ...database, schemaReady },
      ai,
      hints: schemaReady
        ? []
        : ['The database schema is incomplete. Run: npm run db:reset'],
      timestamp: new Date().toISOString(),
    });
  }),
);

router.use('/movies', moviesRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/auth', authRoutes);
router.use('/ai', aiRoutes);
router.use('/admin', adminRoutes);
// Mounted last: provides /api/genres, /api/theatres, /api/shows/:id/seats ...
router.use('/', catalogueRoutes);

export default router;
