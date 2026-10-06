import { Router } from 'express';
import bcrypt from 'bcryptjs';
import asyncHandler from '../utils/asyncHandler.js';
import validate from '../middleware/validate.js';
import ApiError from '../utils/errors.js';
import { query, queryOne, execute } from '../db/pool.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { loginBody, registerBody } from '../schemas/index.js';

const router = Router();

/**
 * POST /api/auth/login
 * Used by the admin sign-in screen and by customers who registered explicitly.
 */
router.post(
  '/login',
  validate(loginBody),
  asyncHandler(async (req, res) => {
    const email = req.body.email.trim().toLowerCase();
    const user = await queryOne(
      `SELECT id, full_name, email, phone, role, password_hash, is_active
         FROM users WHERE email = :email`,
      { email },
    );

    // Same message for "no such user" and "wrong password": never leak which
    // accounts exist.
    const invalid = () => ApiError.unauthorized('E-mail or password is incorrect', 'INVALID_CREDENTIALS');
    if (!user || !user.password_hash || !user.is_active) throw invalid();

    const matches = await bcrypt.compare(req.body.password, user.password_hash);
    if (!matches) throw invalid();

    res.json({
      data: {
        token: signToken(user),
        user: {
          id: user.id,
          name: user.full_name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      },
    });
  }),
);

/**
 * POST /api/auth/register
 * Creates a customer account. Booking does not require an account (guest
 * checkout), so this is optional and mainly useful for tracking your tickets.
 */
router.post(
  '/register',
  validate(registerBody),
  asyncHandler(async (req, res) => {
    const email = req.body.email.trim().toLowerCase();
    const existing = await queryOne('SELECT id FROM users WHERE email = :email', { email });
    if (existing) {
      throw ApiError.conflict('An account with this e-mail already exists', 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const result = await execute(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES (:fullName, :email, :phone, :passwordHash, 'customer')`,
      {
        fullName: req.body.fullName.trim(),
        email,
        phone: req.body.phone.trim(),
        passwordHash,
      },
    );

    const user = { id: result.insertId, full_name: req.body.fullName.trim(), email, role: 'customer' };
    res.status(201).json({ data: { token: signToken(user), user: { ...user, name: user.full_name } } });
  }),
);

/** GET /api/auth/me — the signed-in user behind the bearer token. */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await queryOne(
      `SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = :id`,
      { id: req.user.sub },
    );
    if (!user) throw ApiError.unauthorized('This account no longer exists');
    res.json({
      data: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  }),
);

export default router;
