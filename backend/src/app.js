import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import env, { PROJECT_ROOT } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

/**
 * Express application.
 *
 * In development the React dev server (Vite) proxies /api to this process.
 * In production (`npm run build` then `npm start`) the built frontend in
 * frontend/dist is served from here, so the whole project runs on one port.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Express adds ETags to JSON by default, which lets a browser replay a stale
  // response (a cached 401 after signing in, for example). API payloads are
  // stateful and must never be served from cache.
  app.set('etag', false);

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: curl, server-to-server, same-origin requests.
        if (!origin) return callback(null, true);
        if (env.server.corsOrigins.includes(origin) || !env.isProduction) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));

  // Compact request log: method, path, status, duration.
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
      if (res.statusCode >= 500) logger.error(line, undefined, 'http');
      else if (res.statusCode >= 400) logger.warn(line, undefined, 'http');
      else if (!req.originalUrl.startsWith('/api/health')) logger.info(line, undefined, 'http');
    });
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use('/api', apiRoutes);

  // Unknown /api routes must return JSON, not the SPA shell.
  app.use('/api', (req, _res, next) => notFoundHandler(req, next));

  // ---- Static frontend (production build) --------------------------------
  const distDir = path.join(PROJECT_ROOT, 'frontend', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
          // Hashed assets are immutable; index.html must never be cached.
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
          else res.setHeader('Cache-Control', 'public, max-age=604800');
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      return res.sendFile(path.join(distDir, 'index.html'));
    });
    logger.info(`serving frontend build from ${distDir}`, undefined, 'app');
  } else {
    app.get('/', (_req, res) => {
      res.json({
        service: 'cineverse-api',
        message: 'API is running. The React client runs separately in development (npm run dev) or after npm run build.',
        docs: '/api/health',
      });
    });
  }

  app.use((req, _res, next) => notFoundHandler(req, next));
  app.use(errorHandler);

  return app;
}

export default createApp;
