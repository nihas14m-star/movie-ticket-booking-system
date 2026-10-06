/**
 * Small structured logger.
 *
 * Deliberately dependency free. Never log secrets: the AI module passes request
 * metadata only, and `redact` keeps its guard rails in one place.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const stamp = () => new Date().toISOString();

const write = (level, stream, scope, message, meta) => {
  if (LEVELS[level] > activeLevel) return;
  const prefix = `${stamp()} [${level.toUpperCase()}] ${scope ? `(${scope}) ` : ''}`;
  if (meta === undefined) {
    stream(`${prefix}${message}`);
  } else {
    stream(`${prefix}${message}`, typeof meta === 'string' ? meta : JSON.stringify(meta));
  }
};

export const logger = {
  error: (message, meta, scope) => write('error', console.error, scope, message, meta),
  warn: (message, meta, scope) => write('warn', console.warn, scope, message, meta),
  info: (message, meta, scope) => write('info', console.log, scope, message, meta),
  debug: (message, meta, scope) => write('debug', console.log, scope, message, meta),
};

/**
 * Replace the value of anything that looks like a credential, so log lines are
 * safe to paste into a report or an issue.
 */
export function redact(value) {
  if (value == null) return value;
  const secrets = ['OPENROUTER_API_KEY', 'DB_PASSWORD', 'JWT_SECRET', 'authorization'];
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const key of secrets) {
    const fromEnv = process.env[key];
    if (fromEnv) text = text.split(fromEnv).join('***');
  }
  text = text.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default logger;
