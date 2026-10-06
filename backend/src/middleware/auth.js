import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ApiError from '../utils/errors.js';

/**
 * JWT authentication.
 *
 * Only administrators can sign in with a password today; customers are created
 * automatically at booking time (guest checkout) and may register explicitly
 * through POST /api/auth/register.
 */

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.full_name ?? user.name },
    env.auth.jwtSecret,
    { expiresIn: env.auth.jwtExpiresIn },
  );
}

function readToken(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/** Attaches req.user when a valid token is present; never rejects. */
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    req.user = jwt.verify(token, env.auth.jwtSecret);
  } catch {
    req.user = undefined;
  }
  return next();
}

/** Requires a valid token. */
export function requireAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next(ApiError.unauthorized('Sign in to continue'));
  try {
    req.user = jwt.verify(token, env.auth.jwtSecret);
    return next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError'
      ? 'Your session has expired. Please sign in again.'
      : 'Invalid authentication token';
    return next(ApiError.unauthorized(message));
  }
}

/** Requires a valid token belonging to an administrator. */
export function requireAdmin(req, res, next) {
  return requireAuth(req, res, (error) => {
    if (error) return next(error);
    if (req.user?.role !== 'admin') {
      return next(ApiError.forbidden('Administrator access is required', 'ADMIN_REQUIRED'));
    }
    return next();
  });
}

export default { signToken, optionalAuth, requireAuth, requireAdmin };
