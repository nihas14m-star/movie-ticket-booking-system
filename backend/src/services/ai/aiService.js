import logger from '../../utils/logger.js';
import { AiUnavailableError } from '../../utils/errors.js';
import { query } from '../../db/pool.js';
import { getMoviesByIds, listMovies, listCities } from '../movieService.js';
import { getToday } from '../showService.js';
import { chat, isConfigured, getAiStatus, extractJson } from './openrouterClient.js';
import { parseIntent, rankByQuery, describeIntent } from './fallbackMatcher.js';

/**
 * AI features for the booking site.
 *
 * Hard rules enforced here:
 *  1. The model may only SELECT from our catalogue. Every id it returns is
 *     validated against the movies table and the final payload is re-hydrated
 *     from MySQL, so a hallucinated title can never reach the UI.
 *  2. The model can never create, price, confirm or cancel a booking. There are
 *     no tools/functions wired to it; it only produces text and movie ids.
 *  3. If OpenRouter is unavailable (no key, rate limit, timeout, bad JSON) every
 *     method degrades to the local matcher and says so in `notice`.
 */

const NOT_CONFIGURED_NOTICE =
  'AI suggestions are offline because OPENROUTER_API_KEY is not configured. Showing results from the built-in matcher.';

const FALLBACK_NOTICE =
  'The AI service is temporarily unavailable. Showing results from the built-in matcher.';

/** Turn an AiUnavailableError into a short, user facing explanation. */
function noticeFor(error) {
  if (!(error instanceof AiUnavailableError)) return FALLBACK_NOTICE;
  switch (error.reason) {
    case 'not_configured':
      return NOT_CONFIGURED_NOTICE;
    case 'rate_limited':
      return 'The AI service is rate limited right now. Showing results from the built-in matcher.';
    case 'timeout':
      return 'The AI service took too long to respond. Showing results from the built-in matcher.';
    case 'unauthorized':
      return 'The configured AI key was rejected. Showing results from the built-in matcher.';
    default:
      return FALLBACK_NOTICE;
  }
}

/**
 * The catalogue handed to the model: just enough to reason with, and never more
 * than the 12 films we actually have on sale.
 */
export async function getCatalog() {
  const today = await getToday();
  const rows = await query(
    `SELECT m.id, m.title, m.slug, m.synopsis, m.duration_minutes, m.language,
            m.certificate, m.rating, m.status, m.director, m.cast_list,
            m.poster_url, m.release_date, m.is_featured,
            (SELECT COUNT(*) FROM shows sh
              WHERE sh.movie_id = m.id AND sh.status = 'scheduled'
                AND sh.show_date = :today AND sh.start_time > CURTIME()) AS shows_today,
            (SELECT MIN(sh.show_date) FROM shows sh
              WHERE sh.movie_id = m.id AND sh.status = 'scheduled'
                AND (sh.show_date > :today
                     OR (sh.show_date = :today AND sh.start_time > CURTIME()))) AS next_show_date
       FROM movies m
      ORDER BY (m.status = 'now_showing') DESC, m.rating DESC`,
    { today },
  );

  const genreRows = await query(
    `SELECT mg.movie_id, g.name FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id ORDER BY g.name`,
  );
  const genresByMovie = new Map();
  for (const row of genreRows) {
    if (!genresByMovie.has(row.movie_id)) genresByMovie.set(row.movie_id, []);
    genresByMovie.get(row.movie_id).push(row.name);
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    genres: genresByMovie.get(row.id) ?? [],
    durationMinutes: row.duration_minutes,
    language: row.language,
    certificate: row.certificate,
    rating: row.rating,
    status: row.status,
    director: row.director,
    cast: row.cast_list,
    synopsis: row.synopsis,
    posterUrl: row.poster_url,
    releaseDate: row.release_date,
    isFeatured: Boolean(row.is_featured),
    showsToday: row.shows_today,
    nextShowDate: row.next_show_date,
  }));
}

/** Compact JSON for prompts (keeps token usage predictable). */
function catalogForPrompt(catalog) {
  return catalog.map((movie) => ({
    id: movie.id,
    title: movie.title,
    genres: movie.genres,
    minutes: movie.durationMinutes,
    language: movie.language,
    certificate: movie.certificate,
    rating: movie.rating,
    status: movie.status,
    showsToday: movie.showsToday,
    synopsis: movie.synopsis.length > 220 ? `${movie.synopsis.slice(0, 220)}...` : movie.synopsis,
  }));
}

const RECOMMEND_SYSTEM_PROMPT = `You are the recommendation engine for CINEVERSE, a cinema booking website.

You will receive the complete catalogue of films that CINEVERSE currently sells tickets for. You may ONLY recommend films from that catalogue.

Respond with a single JSON object and nothing else:
{
  "summary": "one or two friendly sentences explaining your picks",
  "recommendations": [ { "id": <catalogue id>, "reason": "why this fits, max 18 words" } ]
}

Rules:
- Never invent a film, a showtime, a price or an id that is not in the catalogue.
- Order recommendations best-first. At most 4 unless asked otherwise.
- Prefer status "now_showing" when the user wants to watch something soon.
- If nothing really fits, return your closest options and say so in the summary.`;

/**
 * AI movie recommendation.
 * @returns {Promise<object>} always resolves — never throws for AI problems
 */
export async function recommendMovies({ query: userQuery, limit = 4 }) {
  const catalog = await getCatalog();
  const status = getAiStatus();

  if (!catalog.length) {
    return {
      source: 'database', notice: null, movies: [], summary: 'The catalogue is empty.', model: null,
    };
  }

  if (isConfigured()) {
    try {
      const { content, model } = await chat({
        jsonMode: true,
        messages: [
          { role: 'system', content: RECOMMEND_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Catalogue:\n${JSON.stringify(catalogForPrompt(catalog))}\n\nUser request: ${userQuery}\n\nReturn at most ${limit} recommendations as JSON.`,
          },
        ],
      });

      const parsed = extractJson(content);
      const byId = new Map(catalog.map((movie) => [movie.id, movie]));
      const picks = [];
      for (const item of Array.isArray(parsed.recommendations) ? parsed.recommendations : []) {
        const id = Number(item?.id);
        const movie = byId.get(id);
        // Only ids that exist in MySQL survive this filter.
        if (movie) picks.push({ id, reason: String(item.reason ?? '').slice(0, 200) });
      }

      if (!picks.length) {
        throw new AiUnavailableError('AI recommended no catalogue films', 'unusable_response');
      }

      // Re-hydrate from the database: the UI shows DB rows, not model output.
      const movies = await getMoviesByIds(picks.map((pick) => pick.id));
      const reasonById = new Map(picks.map((pick) => [pick.id, pick.reason]));

      return {
        source: 'openrouter',
        model,
        configured: true,
        configuredModel: status.model,
        summary: String(parsed.summary ?? 'Here is what we would watch.').slice(0, 600),
        movies: movies
          .sort((a, b) => picks.findIndex((p) => p.id === a.id) - picks.findIndex((p) => p.id === b.id))
          .map((movie) => ({ ...movie, reason: reasonById.get(movie.id) ?? null })),
        notice: null,
      };
    } catch (error) {
      logger.warn(`AI recommendation fell back: ${error.message}`, { reason: error.reason }, 'ai');
      const fallback = fallbackRecommend(userQuery, catalog, limit);
      return { ...fallback, notice: noticeFor(error) };
    }
  }

  const fallback = fallbackRecommend(userQuery, catalog, limit);
  return { ...fallback, notice: NOT_CONFIGURED_NOTICE };
}

function fallbackRecommend(userQuery, catalog, limit) {
  const ranked = rankByQuery(userQuery, catalog, limit);
  const intent = parseIntent(userQuery);
  return {
    source: 'fallback',
    model: null,
    configured: false,
    summary: ranked.length
      ? `Based on ${describeIntent(intent)}, these are the closest matches in our catalogue.`
      : 'We could not match that request to a specific film, so here are our most popular titles.',
    movies: ranked.map((entry) => ({ ...entry.movie, reason: entry.reason })),
  };
}

/**
 * Natural-language search.
 *
 * The model is used ONLY to translate language into structured filters. The
 * actual matching is a normal SQL query against MySQL, which is why the results
 * can never contain films we do not sell.
 */
export async function naturalLanguageSearch({ query: userQuery, limit = 12 }) {
  const catalog = await getCatalog();
  const localIntent = parseIntent(userQuery);

  const localFilters = {
    search: localIntent.keywords.join(' ') || undefined,
    genres: localIntent.genres,
    maxDurationMinutes: localIntent.maxMinutes,
    certificate: localIntent.certificate === 'U' ? 'U' : undefined,
    status: undefined,
  };

  let filters = localFilters;
  let explanation = `Interpreted as: ${describeIntent(localIntent)}.`;
  let source = 'fallback';
  let model = null;
  let notice = isConfigured() ? null : NOT_CONFIGURED_NOTICE;

  if (isConfigured()) {
    try {
      const { content, model: usedModel } = await chat({
        jsonMode: true,
        messages: [
          {
            role: 'system',
            content: `You translate cinema search requests into JSON filters for a MySQL movie catalogue.

Respond with a single JSON object:
{
  "explanation": "one short sentence, plain language, about what you searched for",
  "keywords": "free text words to match against title/synopsis, or empty string",
  "genres": ["subset of: action, adventure, animation, comedy, drama, family, fantasy, horror, mystery, romance, sci-fi, thriller"],
  "maxDurationMinutes": <number or null>,
  "certificate": "U" | "UA" | "A" | null,
  "status": "now_showing" | "upcoming" | null
}

Rules:
- Only use genres from the list above.
- "tonight"/"today"/"now" implies status "now_showing".
- Leave a field out or use null/empty when the user did not ask for it.
- Never invent film titles: keywords search our catalogue, they are not a guess.`,
          },
          { role: 'user', content: `Catalogue titles: ${catalog.map((movie) => movie.title).join(', ')}\n\nSearch request: ${userQuery}` },
        ],
      });

      const parsed = extractJson(content);
      const allowedGenres = new Set(['action', 'adventure', 'animation', 'comedy', 'drama', 'family', 'fantasy', 'horror', 'mystery', 'romance', 'sci-fi', 'thriller']);
      const genres = Array.isArray(parsed.genres)
        ? parsed.genres.map((genre) => String(genre).toLowerCase().trim()).filter((genre) => allowedGenres.has(genre))
        : [];
      const noDurationSignal = localFilters.maxDurationMinutes == null;

      filters = {
        // Keep the locally parsed duration if the model ignored it: the local
        // parser is deterministic and better at "under 2.5 hours" style input.
        search: String(parsed.keywords ?? '').trim() || localFilters.search,
        genres: genres.length ? genres : localFilters.genres,
        maxDurationMinutes: Number.isFinite(Number(parsed.maxDurationMinutes))
          ? Number(parsed.maxDurationMinutes)
          : (noDurationSignal ? undefined : localFilters.maxDurationMinutes),
        certificate: ['U', 'UA', 'A'].includes(parsed.certificate) ? parsed.certificate : localFilters.certificate,
        status: ['now_showing', 'upcoming'].includes(parsed.status) ? parsed.status : undefined,
      };
      explanation = String(parsed.explanation ?? explanation).slice(0, 300);
      source = 'openrouter';
      model = usedModel;
    } catch (error) {
      logger.warn(`AI search fell back: ${error.message}`, { reason: error.reason }, 'ai');
      notice = noticeFor(error);
      source = 'fallback';
    }
  }

  // The database answers the actual question.
  const { data: movies, meta } = await listMovies({
    search: filters.search,
    genres: filters.genres,
    maxDurationMinutes: filters.maxDurationMinutes,
    certificate: filters.certificate,
    status: filters.status,
    limit,
    sort: 'rating',
  });

  // Empty AI interpretation must not produce an empty page: retry with the
  // locally derived filters, which are always populated from the text.
  let results = movies;
  let usedFallbackFilters = false;
  if (!results.length && (filters.genres.length || filters.search)) {
    usedFallbackFilters = true;
    const retry = await listMovies({
      genres: localFilters.genres,
      maxDurationMinutes: localFilters.maxDurationMinutes,
      status: 'now_showing',
      limit,
      sort: 'rating',
    });
    results = retry.data;
  }

  return {
    source,
    model,
    notice,
    explanation,
    filters: usedFallbackFilters ? localFilters : filters,
    movies: results,
    total: usedFallbackFilters ? results.length : meta.total,
    usedFallbackFilters,
  };
}

const ASSISTANT_SYSTEM_PROMPT = `You are CINEVERSE Assist, the in-app helper of a cinema ticket booking website.

You help visitors choose a film and explain how booking works. You cannot book, cancel, price or confirm anything - if asked to, tell the user to use the Book Now button and the seat map, and that payment and confirmation are handled by the booking system.

Always answer with a single JSON object:
{
  "reply": "your answer, at most 90 words, warm and concise",
  "movieIds": [ids from the catalogue you are talking about, or []]
}

Rules:
- Only mention films, showtimes and prices that appear in the context you are given.
- Never invent showtimes, prices, screens or availability.
- When the user seems unsure, suggest 2-3 films from the catalogue with one-line reasons.
- Keep the booking instructions concrete: choose a show, pick seats, enter details, pay, get the QR ticket.`;

/**
 * Conversational assistant.
 * @param {{message:string, history?:Array<{role:string,content:string}>}} input
 */
export async function askAssistant({ message, history = [] }) {
  const [catalog, today, cities] = await Promise.all([getCatalog(), getToday(), listCities()]);

  const context = {
    today,
    cities: cities.map((row) => row.city),
    catalogue: catalogForPrompt(catalog),
  };

  if (isConfigured()) {
    try {
      const { content, model } = await chat({
        jsonMode: true,
        messages: [
          { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
          { role: 'system', content: `Context: ${JSON.stringify(context)}` },
          ...history.slice(-6).map((entry) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: String(entry.content ?? '').slice(0, 800),
          })),
          { role: 'user', content: String(message).slice(0, 800) },
        ],
      });

      const parsed = extractJson(content);
      const ids = (Array.isArray(parsed.movieIds) ? parsed.movieIds : [])
        .map(Number)
        .filter((id) => catalog.some((movie) => movie.id === id));
      const movies = ids.length ? await getMoviesByIds(ids) : [];

      return {
        source: 'openrouter',
        model,
        notice: null,
        reply: String(parsed.reply ?? '').slice(0, 1200) || 'How can I help with your booking?',
        movies,
        suggestions: defaultSuggestions(),
      };
    } catch (error) {
      logger.warn(`AI assistant fell back: ${error.message}`, { reason: error.reason }, 'ai');
      return { ...fallbackAssistant(message, catalog, today), notice: noticeFor(error) };
    }
  }

  return { ...fallbackAssistant(message, catalog, today), notice: NOT_CONFIGURED_NOTICE };
}

function defaultSuggestions() {
  return [
    'What should I watch tonight?',
    'Which movies are good for a family?',
    'How do I book tickets?',
    'Show me something under 2 hours',
  ];
}

/** Rule-based assistant used when the model is not available. */
function fallbackAssistant(message, catalog, today) {
  const text = String(message ?? '').toLowerCase();
  const nowShowing = catalog.filter((movie) => movie.status === 'now_showing');

  const bookingHelp = /(book|booking|how do i|how to|ticket|pay|payment|seat|cancel|refund|qr)/.test(text);

  if (bookingHelp && !parseIntent(message).genres.length) {
    return {
      source: 'fallback',
      model: null,
      reply: [
        `Booking takes four steps: open a film, pick a theatre and show time for one of the next 7 days, choose your seats on the hall map, then enter your name, e-mail and phone and pay.`,
        `You get a confirmation screen with a booking ID (CV-XXXX-XXXX) and a QR ticket you can print. Seats are held for 10 minutes while you pay, and a cancelled booking frees its seats immediately.`,
        `Today is ${today} and ${nowShowing.length} films are currently showing.`,
      ].join(' '),
      movies: [],
      suggestions: defaultSuggestions(),
    };
  }

  const ranked = rankByQuery(message, catalog, 3);
  if (ranked.length) {
    return {
      source: 'fallback',
      model: null,
      reply: `Here are the closest matches in our catalogue. Tap one to see its theatres and showtimes.`,
      movies: ranked.map((entry) => ({ ...entry.movie, reason: entry.reason })),
      suggestions: defaultSuggestions(),
    };
  }

  return {
    source: 'fallback',
    model: null,
    reply: `I can help you pick a film or explain booking. Today is ${today} and ${nowShowing.length} films are showing, including ${nowShowing.slice(0, 3).map((movie) => movie.title).join(', ')}. Ask me for a genre, a mood or a length and I will narrow it down.`,
    movies: [],
    suggestions: defaultSuggestions(),
  };
}

export { getAiStatus };

export default {
  getCatalog,
  recommendMovies,
  naturalLanguageSearch,
  askAssistant,
  getAiStatus,
};
