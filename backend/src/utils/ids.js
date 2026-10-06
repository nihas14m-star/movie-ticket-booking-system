import crypto from 'node:crypto';

/**
 * Human friendly identifiers.
 *
 * Booking references are read aloud and typed by users, so they use an alphabet
 * without ambiguous characters (no O/0, I/1) and are grouped for readability:
 *   CV-7K4M-2QP9
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Cryptographically random code of `length` characters from ALPHABET. */
function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** e.g. CV-7K4M-2QP9 */
export function generateBookingReference() {
  return `CV-${randomCode(4)}-${randomCode(4)}`;
}

/** e.g. PAY-9F2KQ7RT4M1X */
export function generatePaymentReference() {
  return `PAY-${randomCode(12)}`;
}

/** URL friendly slug for movies / theatres. */
export function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

/** Accepts "CV-7K4M-2QP9", "cv7k4m2qp9" and normalises to the canonical form. */
export function normaliseBookingReference(value) {
  const cleaned = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const withoutPrefix = cleaned.startsWith('CV') ? cleaned.slice(2) : cleaned;
  if (withoutPrefix.length !== 8) return String(value ?? '').toUpperCase();
  return `CV-${withoutPrefix.slice(0, 4)}-${withoutPrefix.slice(4)}`;
}

export { randomCode };
