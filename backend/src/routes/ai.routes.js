import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import validate from '../middleware/validate.js';
import { recommendBody, aiSearchBody, assistantBody } from '../schemas/index.js';
import { recommendMovies, naturalLanguageSearch, askAssistant, getAiStatus } from '../services/ai/aiService.js';

/**
 * AI feature routes.
 *
 * All three endpoints ALWAYS answer. If OpenRouter is missing, slow or failing,
 * they fall back to the local matcher and include a `notice` the UI displays.
 * None of them can create, price or confirm a booking.
 */
const router = Router();

/** GET /api/ai/status — lets the UI show whether AI is live without calling it. */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const status = getAiStatus();
    res.json({
      data: {
        // The key itself is never returned, only whether one is configured.
        enabled: status.configured,
        model: status.model,
        message: status.configured
          ? 'AI features are active.'
          : 'AI features are disabled. Set OPENROUTER_API_KEY to enable them; the booking system works fully without it.',
      },
    });
  }),
);

/** POST /api/ai/recommend — "I feel like a funny action movie around 2 hours". */
router.post(
  '/recommend',
  validate(recommendBody),
  asyncHandler(async (req, res) => {
    const result = await recommendMovies(req.body);
    res.json({
      data: {
        query: req.body.query,
        summary: result.summary,
        movies: result.movies,
        source: result.source,
        model: result.model,
        notice: result.notice,
      },
    });
  }),
);

/** POST /api/ai/search — natural language search resolved against MySQL. */
router.post(
  '/search',
  validate(aiSearchBody),
  asyncHandler(async (req, res) => {
    const result = await naturalLanguageSearch(req.body);
    res.json({ data: { query: req.body.query, ...result } });
  }),
);

/** POST /api/ai/assistant — the in-app helper chat. */
router.post(
  '/assistant',
  validate(assistantBody),
  asyncHandler(async (req, res) => {
    const result = await askAssistant(req.body);
    res.json({ data: result });
  }),
);

export default router;
