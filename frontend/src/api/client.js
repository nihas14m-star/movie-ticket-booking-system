/**
 * API client.
 *
 * One place that knows how to talk to the backend: base URL resolution, JSON
 * handling, staff/admin token injection and turning error responses into
 * throwable `ApiError`s the UI can render.
 *
 * The browser NEVER sees an OpenRouter key or database credential: every call
 * below goes to our own REST API.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const ADMIN_TOKEN_KEY = 'cineverse.admin.token';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const adminToken = {
  get: () => {
    try {
      return window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } catch {
      /* storage disabled — the session simply will not persist */
    }
  },
  clear: () => {
    try {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Build a query string, dropping empty values. */
function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request(path, { method = 'GET', body, params, auth = false, signal } = {}) {
  const url = `${BASE_URL}/api${path}${toQuery(params)}`;

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = adminToken.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(
      'Cannot reach the Cineverse API. Is the backend running on port 5000?',
      { code: 'NETWORK_ERROR' },
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(error.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: error.code ?? 'HTTP_ERROR',
      details: error.details,
    });
  }

  return payload ?? {};
}

const get = (path, params, options) => request(path, { ...options, params });
const post = (path, body, options) => request(path, { ...options, method: 'POST', body });
const put = (path, body, options) => request(path, { ...options, method: 'PUT', body });
const del = (path, options) => request(path, { ...options, method: 'DELETE' });

/* ------------------------------------------------------------------ api -- */
export const api = {
  /* health + metadata */
  health: () => get('/health'),
  genres: () => get('/genres'),
  cities: () => get('/cities'),
  languages: () => get('/languages'),
  theatres: (params) => get('/theatres', params),

  /* catalogue */
  movies: (params, options) => get('/movies', params, options),
  featuredMovies: (limit = 5, options) => get('/movies/featured', { limit }, options),
  movie: (idOrSlug, options) => get(`/movies/${encodeURIComponent(idOrSlug)}`, undefined, options),
  showtimes: (idOrSlug, params, options) =>
    get(`/movies/${encodeURIComponent(idOrSlug)}/shows`, params, options),

  /* shows + seats */
  show: (id, options) => get(`/shows/${id}`, undefined, options),
  seatMap: (id, options) => get(`/shows/${id}/seats`, undefined, options),

  /* bookings */
  createBooking: (payload) => post('/bookings', payload),
  payBooking: (reference, payload) => post(`/bookings/${reference}/pay`, payload),
  cancelBooking: (reference, payload = {}) => post(`/bookings/${reference}/cancel`, payload),
  booking: (reference, options) => get(`/bookings/${encodeURIComponent(reference)}`, undefined, options),
  findBookings: (email, options) => get('/bookings', { email }, options),

  /* ai */
  aiStatus: (options) => get('/ai/status', undefined, options),
  aiRecommend: (payload) => post('/ai/recommend', payload),
  aiSearch: (payload) => post('/ai/search', payload),
  aiAssistant: (payload) => post('/ai/assistant', payload),

  /* auth + admin */
  login: (payload) => post('/auth/login', payload),
  me: () => get('/auth/me', undefined, { auth: true }),
  admin: {
    stats: () => get('/admin/stats', undefined, { auth: true }),
    movies: (params) => get('/admin/movies', params, { auth: true }),
    movie: (id) => get(`/admin/movies/${id}`, undefined, { auth: true }),
    createMovie: (payload) => post('/admin/movies', payload, { auth: true }),
    updateMovie: (id, payload) => put(`/admin/movies/${id}`, payload, { auth: true }),
    deleteMovie: (id) => del(`/admin/movies/${id}`, { auth: true }),
    genres: () => get('/admin/genres', undefined, { auth: true }),
    theatres: () => get('/admin/theatres', undefined, { auth: true }),
    createTheatre: (payload) => post('/admin/theatres', payload, { auth: true }),
    updateTheatre: (id, payload) => put(`/admin/theatres/${id}`, payload, { auth: true }),
    deleteTheatre: (id) => del(`/admin/theatres/${id}`, { auth: true }),
    screens: (params) => get('/admin/screens', params, { auth: true }),
    createScreen: (payload) => post('/admin/screens', payload, { auth: true }),
    updateScreen: (id, payload) => put(`/admin/screens/${id}`, payload, { auth: true }),
    deleteScreen: (id) => del(`/admin/screens/${id}`, { auth: true }),
    shows: (params) => get('/admin/shows', params, { auth: true }),
    createShow: (payload) => post('/admin/shows', payload, { auth: true }),
    updateShow: (id, payload) => put(`/admin/shows/${id}`, payload, { auth: true }),
    deleteShow: (id) => del(`/admin/shows/${id}`, { auth: true }),
    bookings: (params) => get('/admin/bookings', params, { auth: true }),
    customers: (params) => get('/admin/customers', params, { auth: true }),
    customer: (id) => get(`/admin/customers/${id}`, undefined, { auth: true }),
  },
};

/* --------------------------------------------------------------- helpers -- */

/** ₹ formatting used everywhere prices appear. */
export function formatCurrency(value, currency = 'INR') {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** "2026-10-06" + "19:30:00" -> "Tue, 6 Oct · 7:30 PM" */
export function formatShowDateTime(showDate, startTime) {
  if (!showDate) return '';
  const iso = `${showDate}T${(startTime ?? '00:00:00').slice(0, 8)}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return `${showDate} ${startTime ?? ''}`;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** "19:30:00" -> "7:30 PM" */
export function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = String(time).split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** "2026-10-06" -> "Tue 6 Oct" (UTC, matching how the API stores dates) */
export function formatDateParts(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { dayOfWeek: '', dayOfMonth: '', month: '', full: dateString };
  return {
    dayOfWeek: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(date),
    dayOfMonth: new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'UTC' }).format(date),
    month: new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(date),
    full: new Intl.DateTimeFormat('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(date),
  };
}

/** "142" -> "2h 22m" */
export function formatDuration(minutes) {
  const safe = Number(minutes) || 0;
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, '0')}m`;
}

export default api;
