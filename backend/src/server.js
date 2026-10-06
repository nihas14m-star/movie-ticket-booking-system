import env, { assertProductionSecrets } from './config/env.js';
import { createApp } from './app.js';
import { ping, tableCount, closePool } from './db/pool.js';
import { releaseExpiredHolds } from './services/showService.js';
import logger from './utils/logger.js';

/**
 * Server entry point.
 *
 * Boot sequence: validate config -> check MySQL -> start HTTP -> start the
 * housekeeping timer that releases abandoned seat holds.
 */

assertProductionSecrets();

const app = createApp();
let server;
let cleanupTimer;

async function checkDatabase() {
  try {
    const ok = await ping();
    const tables = await tableCount();
    if (!ok) throw new Error('ping failed');
    if (tables < 13) {
      logger.warn(`only ${tables}/13 tables found — run "npm run db:reset" to load the schema and sample data`, undefined, 'boot');
    } else {
      logger.info(`MySQL connected (${tables} tables in ${env.db.database})`, undefined, 'boot');
    }
  } catch (error) {
    logger.error(`MySQL is not reachable at ${env.db.host}:${env.db.port} — ${error.code ?? error.message}`, undefined, 'boot');
    logger.error('Start MySQL, check .env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD), then run "npm run db:reset".', undefined, 'boot');
    if (env.isProduction) process.exit(1);
  }
}

/**
 * Abandoned checkouts must free their seats even if nobody is browsing.
 * The same procedure also runs before every seat-map read and booking attempt.
 */
function startHoldCleanup() {
  const intervalMs = 60_000;
  cleanupTimer = setInterval(async () => {
    try {
      const released = await releaseExpiredHolds();
      if (released > 0) logger.info(`released ${released} expired seat hold(s)`, undefined, 'housekeeping');
    } catch (error) {
      logger.warn(`hold cleanup failed: ${error.message}`, undefined, 'housekeeping');
    }
  }, intervalMs);
  cleanupTimer.unref();
}

async function start() {
  await checkDatabase();

  server = app.listen(env.server.port, env.server.host, () => {
    logger.info(`CINEVERSE API listening on http://${env.server.host}:${env.server.port}`, undefined, 'boot');
    logger.info(`environment: ${env.nodeEnv} · ai: ${env.ai.apiKey ? `enabled (${env.ai.model})` : 'disabled (no OPENROUTER_API_KEY)'}`, undefined, 'boot');
    logger.info(`health check: http://${env.server.host}:${env.server.port}/api/health`, undefined, 'boot');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`port ${env.server.port} is already in use. Set PORT in .env to a free port.`, undefined, 'boot');
    } else {
      logger.error(`server error: ${error.message}`, undefined, 'boot');
    }
    process.exit(1);
  });

  startHoldCleanup();
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down`, undefined, 'boot');
  if (cleanupTimer) clearInterval(cleanupTimer);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closePool().catch(() => {});
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { shutdown(signal); });
}

process.on('unhandledRejection', (reason) => {
  logger.error(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`, undefined, 'process');
});

start();

export default app;
