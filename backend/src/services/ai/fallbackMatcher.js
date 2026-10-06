/**
 * Local recommendation engine — the graceful fallback.
 *
 * Used when OpenRouter is not configured, rate limited, slow or answers with
 * something unusable. It is deliberately simple and transparent (a small scoring
 * function over real catalogue rows), so the feature still works end to end
 * without an API key, and the UI can honestly say the answer came from the
 * built-in matcher rather than the AI.
 */

/** Words people actually type -> genre slugs in our database. */
const GENRE_SYNONYMS = {
  action: 'action',
  fight: 'action',
  fights: 'action',
  explosive: 'action',
  adventure: 'adventure',
  journey: 'adventure',
  quest: 'adventure',
  animated: 'animation',
  animation: 'animation',
  cartoon: 'animation',
  comedy: 'comedy',
  funny: 'comedy',
  hilarious: 'comedy',
  laugh: 'comedy',
  laughing: 'comedy',
  feelgood: 'comedy',
  drama: 'drama',
  emotional: 'drama',
  intense: 'drama',
  family: 'family',
  kids: 'family',
  children: 'family',
  fantasy: 'fantasy',
  magical: 'fantasy',
  horror: 'horror',
  scary: 'horror',
  frightening: 'horror',
  spooky: 'horror',
  mystery: 'mystery',
  whodunnit: 'mystery',
  romance: 'romance',
  romantic: 'romance',
  love: 'romance',
  date: 'romance',
  'sci-fi': 'sci-fi',
  scifi: 'sci-fi',
  'science fiction': 'sci-fi',
  space: 'sci-fi',
  futuristic: 'sci-fi',
  robot: 'sci-fi',
  thriller: 'thriller',
  suspense: 'thriller',
  tense: 'thriller',
  gripping: 'thriller',
};

const STOP_WORDS = new Set([
  'i', 'want', 'to', 'watch', 'a', 'an', 'the', 'movie', 'movies', 'film', 'films',
  'something', 'some', 'me', 'show', 'please', 'for', 'with', 'and', 'or', 'of',
  'like', 'would', 'can', 'you', 'recommend', 'suggest', 'looking', 'am', 'is',
  'are', 'that', 'this', 'it', 'in', 'on', 'tonight', 'today', 'good', 'best',
  'around', 'about', 'under', 'less', 'than', 'over', 'more', 'hours', 'hour',
  'minutes', 'min', 'mins', 'long', 'short', 'feeling', 'feel', 'mood', 'my',
]);

/** Extracts a duration constraint such as "under 2.5 hours" or "less than 130 min". */
export function parseDurationConstraint(text) {
  const lower = String(text ?? '').toLowerCase();

  const hourMatch = /(under|below|less than|shorter than|max|maximum|upto|up to|within)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/.exec(lower);
  if (hourMatch) return { maxMinutes: Math.round(parseFloat(hourMatch[2]) * 60) };

  const minMatch = /(under|below|less than|shorter than|max|maximum|upto|up to|within)\s*(\d{2,3})\s*(?:minutes|mins?)\b/.exec(lower);
  if (minMatch) return { maxMinutes: parseInt(minMatch[2], 10) };

  const aroundMatch = /(around|about|roughly|approximately|nearly)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/.exec(lower);
  if (aroundMatch) {
    const target = Math.round(parseFloat(aroundMatch[2]) * 60);
    return { targetMinutes: target, toleranceMinutes: 25 };
  }
  return {};
}

/** Extracts genre slugs from free text. */
export function parseGenres(text) {
  const lower = ` ${String(text ?? '').toLowerCase()} `;
  const found = new Set();
  for (const [word, genre] of Object.entries(GENRE_SYNONYMS)) {
    const pattern = new RegExp(`[^a-z]${word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}[^a-z]`);
    if (pattern.test(lower)) found.add(genre);
  }
  return [...found];
}

/** "family friendly", "for kids", "no violence" -> U / UA certificates. */
export function parseCertificatePreference(text) {
  const lower = String(text ?? '').toLowerCase();
  if (/(family|kids|children|child|toddler|parents|grandparents|all ages)/.test(lower)) return 'U';
  return null;
}

/** Meaningful keywords left after removing stop words and genre words. */
export function extractKeywords(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !GENRE_SYNONYMS[word])
    .slice(0, 8);
}

/**
 * Score one catalogue entry against a parsed intent.
 * @returns {{score:number, reasons:string[]}}
 */
export function scoreMovie(movie, intent) {
  const reasons = [];
  let score = 0;

  const movieGenres = (movie.genres ?? []).map((genre) => String(genre).toLowerCase());
  const matchedGenres = intent.genres.filter((genre) => movieGenres.includes(genre));
  if (matchedGenres.length) {
    score += matchedGenres.length * 3;
    reasons.push(`matches your ${matchedGenres.join(' / ')} request`);
  }

  if (intent.maxMinutes) {
    if (movie.durationMinutes <= intent.maxMinutes) {
      score += 2;
      reasons.push(`runs ${movie.durationMinutes} min, inside your ${intent.maxMinutes} min limit`);
    } else {
      score -= 2;
    }
  }
  if (intent.targetMinutes) {
    const delta = Math.abs(movie.durationMinutes - intent.targetMinutes);
    if (delta <= intent.toleranceMinutes) {
      score += 2;
      reasons.push(`runs ${movie.durationMinutes} min, close to the length you mentioned`);
    }
  }

  const haystack = `${movie.title} ${movie.synopsis} ${movie.director ?? ''}`.toLowerCase();
  const keywordHits = intent.keywords.filter((word) => haystack.includes(word));
  if (keywordHits.length) {
    score += keywordHits.length * 2;
    reasons.push(`mentions ${keywordHits.join(', ')}`);
  }

  if (intent.certificate === 'U') {
    if (movie.certificate === 'U' || movie.certificate === 'UA') {
      score += 1.5;
      reasons.push('suitable for family viewing');
    } else {
      score -= 2;
    }
  }

  if (intent.preferHighRating) {
    score += Number(movie.rating) / 4;
    if (movie.rating >= 8) reasons.push(`well rated at ${movie.rating}/10`);
  } else {
    score += Number(movie.rating) / 20; // gentle tie breaker
  }

  // Screenings you can actually walk into beat announcements.
  if (movie.status === 'now_showing') score += 1;

  return { score, reasons };
}

/** Parse a query into a reusable intent object. */
export function parseIntent(query) {
  const text = String(query ?? '');
  const lower = text.toLowerCase();
  return {
    text,
    genres: parseGenres(text),
    keywords: extractKeywords(text),
    certificate: parseCertificatePreference(text),
    preferHighRating: /(highly rated|best|top rated|great|acclaimed|imdb|score)/.test(lower),
    ...parseDurationConstraint(text),
  };
}

/**
 * Rank the catalogue against a query.
 * @returns {Array<{movie:object, reason:string, score:number}>}
 */
export function rankByQuery(query, catalog, limit = 4) {
  const intent = parseIntent(query);
  const scored = catalog
    .map((movie) => ({ movie, ...scoreMovie(movie, intent) }))
    .sort((a, b) => b.score - a.score || Number(b.movie.rating) - Number(a.movie.rating));

  const hasSignals = intent.genres.length || intent.keywords.length || intent.maxMinutes
    || intent.targetMinutes || intent.certificate || intent.preferHighRating;

  const ranked = hasSignals ? scored.filter((entry) => entry.score > 0) : scored;

  return ranked.slice(0, limit).map((entry) => ({
    movie: entry.movie,
    score: entry.score,
    reason: entry.reasons.length
      ? entry.reasons.slice(0, 2).join(' and ')
      : `popular ${entry.movie.genres?.join(' / ') || 'pick'} rated ${entry.movie.rating}/10`,
  }));
}

/** Build the human readable summary that accompanies a fallback result. */
export function describeIntent(intent) {
  const parts = [];
  if (intent.genres.length) parts.push(intent.genres.join(' / '));
  if (intent.maxMinutes) parts.push(`under ${intent.maxMinutes} minutes`);
  if (intent.certificate === 'U') parts.push('family friendly');
  return parts.length ? parts.join(', ') : 'your request';
}

export default {
  parseIntent,
  rankByQuery,
  scoreMovie,
  parseDurationConstraint,
  parseGenres,
  describeIntent,
};
