import ApiError from '../utils/errors.js';

/**
 * Request validation with zod.
 *
 * The parsed (and coerced) value replaces the raw input, so handlers receive
 * numbers where numbers are expected and never have to re-validate.
 *
 *   router.get('/', validate(listMoviesQuery, 'query'), handler)
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || source,
      message: issue.message,
    }));
    return next(ApiError.badRequest('Request validation failed', 'VALIDATION_ERROR', details));
  }
  req[source] = result.data;
  return next();
};

export default validate;
