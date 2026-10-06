/**
 * Typed errors.
 *
 * Anything thrown as an ApiError reaches the client with a useful HTTP status
 * and a stable machine readable `code`; anything else becomes a generic 500 so
 * internal details (SQL strings, stack traces) never leak to the browser.
 */

export class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code stable error code, e.g. SEATS_UNAVAILABLE
   * @param {string} message human readable message
   * @param {unknown} [details] optional extra payload (validation issues, ...)
   */
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  /** 409 — used for conflicts such as a seat that is already taken. */
  static conflict(message, code = 'CONFLICT', details) {
    return new ApiError(409, code, message, details);
  }

  /** 503 — used when an optional dependency (e.g. OpenRouter) is unavailable. */
  static unavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, code, message);
  }
}

/** Raised by the AI service so callers can degrade instead of failing hard. */
export class AiUnavailableError extends Error {
  constructor(message, reason = 'unknown') {
    super(message);
    this.name = 'AiUnavailableError';
    this.reason = reason;
  }
}

export default ApiError;
