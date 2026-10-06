/**
 * Environment configuration.
 *
 * Load order (first value found wins):
 *   backend/.env   -> project specific overrides
 *   .env           -> project root defaults (shared with tooling)
 *   process.env    -> real environment (already set values are never overwritten)
 *
 * Nothing in this module is ever sent to the browser: the frontend only talks to
 * our REST API, and secrets stay on the server (see docs/ARCHITECTURE.md#security).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, '..', '..');
export const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');

for (const envFile of [path.join(BACKEND_ROOT, '.env'), path.join(PROJECT_ROOT, '.env')]) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
}

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,

  server: {
    port: int(process.env.PORT, 5000),
    host: process.env.HOST ?? '127.0.0.1',
    // Comma separated list; falls back to the local Vite dev server.
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'cineverse',
    connectionLimit: int(process.env.DB_CONNECTION_LIMIT, 10),
  },

  auth: {
    // A development fallback keeps `npm run dev` frictionless; production must
    // provide a real secret (checked in assertProductionSecrets below).
    jwtSecret: process.env.JWT_SECRET ?? 'cineverse-dev-only-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    usingFallbackSecret: !process.env.JWT_SECRET,
  },

  booking: {
    convenienceFeePercent: Number(process.env.CONVENIENCE_FEE_PERCENT ?? 5),
    holdMinutes: int(process.env.BOOKING_HOLD_MINUTES, 10),
    maxSeatsPerBooking: int(process.env.MAX_SEATS_PER_BOOKING, 10),
    // The demo gateway simulates a payment provider. It is intentionally a
    // simulation - no real money movement happens anywhere in this project.
    simulatePayments: bool(process.env.SIMULATE_PAYMENTS, true),
    paymentFailureRate: Number(process.env.PAYMENT_FAILURE_RATE ?? 0),
  },

  ai: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    // Never hard-coded: change the model with an env var, no code changes.
    model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
    timeoutMs: int(process.env.OPENROUTER_TIMEOUT_MS, 20000),
    maxTokens: int(process.env.OPENROUTER_MAX_TOKENS, 900),
    temperature: Number(process.env.OPENROUTER_TEMPERATURE ?? 0.4),
    referer: process.env.OPENROUTER_SITE_URL ?? 'http://localhost:5173',
    title: process.env.OPENROUTER_APP_TITLE ?? 'Cineverse Movie Booking',
  },

  uploads: {
    posterDir: path.join(PROJECT_ROOT, 'frontend', 'public', 'posters'),
  },
};

/** True when AI features can reach OpenRouter at all. */
export const aiConfigured = () => Boolean(env.ai.apiKey);

/**
 * Fail fast in production instead of silently running with development secrets.
 */
export function assertProductionSecrets(logger = console) {
  if (!env.isProduction) return;
  const problems = [];
  if (env.auth.usingFallbackSecret) problems.push('JWT_SECRET is not set');
  if (!env.db.password) problems.push('DB_PASSWORD is not set');
  if (problems.length) {
    throw new Error(`Refusing to start in production: ${problems.join('; ')}`);
  }
  logger.log('[env] production configuration validated');
}

export default env;
