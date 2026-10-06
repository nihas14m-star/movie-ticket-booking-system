import env from '../config/env.js';
import logger from '../utils/logger.js';
import ApiError from '../utils/errors.js';

/** 404 handler for unmatched routes (mounted after all routers). */
export function notFoundHandler(req, next) {
  return next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

const MYSQL_ERROR_MAP = {
  ER_DUP_ENTRY: {
    status: 409,
    code: 'DUPLICATE_ENTRY',
    message: 'That record already exists.',
  },
  ER_ROW_IS_REFERENCED_2: {
    status: 409,
    code: 'RECORD_IN_USE',
    message: 'This record is referenced by other data and cannot be removed.',
  },
  ER_NO_REFERENCED_ROW_2: {
    status: 400,
    code: 'INVALID_REFERENCE',
    message: 'A referenced record does not exist.',
  },
  ER_CHECK_CONSTRAINT_VIOLATED: {
    status: 400,
    code: 'CONSTRAINT_VIOLATION',
    message: 'The data violates a database constraint.',
  },
  ER_DATA_TOO_LONG: {
    status: 400,
    code: 'VALUE_TOO_LONG',
    message: 'One of the submitted values is too long.',
  },
  ER_BAD_NULL_ERROR: {
    status: 400,
    code: 'MISSING_FIELD',
    message: 'A required value is missing.',
  },
};

/**
 * Translate whatever went wrong into a stable JSON envelope:
 *   { error: { code, message, details? } }
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(error, req, res, _next) {
  // mysql2 signals business rule violations with SQLSTATE 45000 (our triggers).
  const mysqlSignal = error.sqlState === '45000';
  const mapped = MYSQL_ERROR_MAP[error.code];

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on our side. Please try again.';
  let details = undefined;

  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (mysqlSignal) {
    status = 409;
    code = 'BUSINESS_RULE_VIOLATION';
    message = error.sqlMessage ?? 'The database rejected this operation.';
  } else if (mapped) {
    status = mapped.status;
    code = mapped.code;
    message = mapped.message;
    if (error.code === 'ER_DUP_ENTRY') {
      // "Duplicate entry 'CV-7K4M-2QP9' for key 'bookings.uq_bookings_reference'"
      const value = /Duplicate entry '([^']+)'/.exec(error.sqlMessage ?? '')?.[1];
      details = value ? { value } : undefined;
    }
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON.';
  } else if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
    status = 503;
    code = 'DATABASE_NOT_READY';
    message = 'The database schema is missing. Run "npm run db:reset" and try again.';
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${error.message}`, {
      stack: env.isProduction ? undefined : error.stack,
    }, 'http');
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${status} ${code}`, message, 'http');
  }

  const body = { error: { code, message } };
  if (details) body.error.details = details;
  if (!env.isProduction && status >= 500) body.error.stack = error.stack;

  res.status(status).json(body);
}

export default errorHandler;
