# CINEVERSE — Architecture

How the system is put together: the layers, the request lifecycle, the decisions behind the schema,
how seat holds survive concurrency, how secrets stay on the server, and how the optional AI layer
plugs in without becoming a dependency.

- [System overview](#system-overview)
- [Request lifecycle](#request-lifecycle)
- [Backend layers](#backend-layers)
- [Data model decisions](#data-model-decisions)
- [Concurrency: seat holds and the double-booking guard](#concurrency-seat-holds-and-the-double-booking-guard)
- [Error handling](#error-handling)
- [Frontend architecture](#frontend-architecture)
- [Security](#security)
- [The AI layer](#the-ai-layer)
- [Configuration](#configuration)
- [Testing strategy](#testing-strategy)
- [Trade-offs and what we would do next](#trade-offs-and-what-we-would-do-next)

---

## System overview

```
┌────────────────────────────┐        ┌──────────────────────────┐        ┌──────────────────┐
│  Browser (React 18 + Vite) │        │  Node.js + Express 4     │        │  MySQL 8.0       │
│                            │  HTTP  │                          │  SQL   │                  │
│  React Router pages        │ ─────► │  routes → services       │ ─────► │  13 tables       │
│  Context providers         │  JSON  │  zod validation          │  mysql2│  2 views         │
│  fetch client (client.js)  │ ◄───── │  JWT auth, error mapping │ ◄───── │  2 triggers      │
│  hand-written CSS system   │        │  ai/ (optional, isolated)│        │  1 procedure     │
└────────────────────────────┘        └───────────┬──────────────┘        └──────────────────┘
                                                  │ HTTPS (server → server, optional)
                                                  ▼
                                        ┌──────────────────────────┐
                                        │  OpenRouter API          │
                                        │  model = OPENROUTER_MODEL│
                                        └──────────────────────────┘
```

Two rules keep this simple:

1. **The browser only ever talks to our API.** It never sees a database credential, never calls
   OpenRouter, and never receives a secret. Anything privileged is a server concern.
2. **The database is the last line of defence.** Invariants that must never be violated (one live
   seat per screening, money on a confirmed booking, no seats on a cancelled show) are enforced by
   unique indexes, generated columns, triggers and CHECK constraints — not only by application code.

In development, Vite serves the frontend on `:5173` and proxies `/api` to Express on `:5000`.
After `npm run build`, Express serves `frontend/dist` itself so the whole project runs on one port.

---

## Request lifecycle

```
HTTP request
  │
  ├─ 1. app.js           CORS allow-list, 200 kB JSON body cap, request log,
  │                      Cache-Control: no-store on /api, ETags disabled
  ├─ 2. routes/*.js      route matching + `validate(schema, 'body|query|params')`
  │                      → 400 VALIDATION_ERROR with per-field details
  ├─ 3. middleware/auth  requireAuth / requireAdmin decode the JWT
  │                      → 401 UNAUTHORIZED · 403 ADMIN_REQUIRED
  ├─ 4. services/*.js    business rules; throws ApiError with a stable code
  │                      (transactions via withTransaction for writes)
  ├─ 5. db/pool.js       parameterised SQL through mysql2
  └─ 6. errorHandler     ApiError → JSON envelope; unknown → 500 INTERNAL_ERROR (logged, not leaked)
```

`asyncHandler` wraps every route so a rejected promise becomes `next(error)` instead of an unhandled
rejection — there is no route in the codebase with a `try/catch` around its whole body.

---

## Backend layers

| Layer | Files | Responsibility |
|---|---|---|
| **Config** | `config/env.js` | Loads `.env` (backend, then project root), coerces types, validates production secrets |
| **HTTP** | `app.js`, `server.js` | Middleware, CORS, static build, graceful shutdown |
| **Routing** | `routes/` | URL + method + schema wiring only. `index.js` mounts `/movies`, `/bookings`, `/auth`, `/ai`, `/admin`, then the catalogue router (which owns `/genres`, `/theatres`, `/shows/...`) |
| **Validation** | `schemas/index.js`, `middleware/validate.js` | One place describing every request contract (zod), auto-coercing query strings |
| **Auth** | `middleware/auth.js` | `signToken`, `requireAuth`, `requireAdmin`, `optionalAuth` |
| **Services** | `services/*.js` | All business rules; the only layer that touches SQL |
| **Data access** | `db/pool.js` | `query`, `queryOne`, `queryWith(conn, …)`, `execute`, `withTransaction`, `callProcedure`, `ping`, `tableCount` |
| **AI** | `services/ai/` | Optional, isolated; see [below](#the-ai-layer) |
| **Cross-cutting** | `utils/errors.js`, `utils/asyncHandler.js`, `utils/ids.js`, `utils/logger.js` | Typed `ApiError`, async wrapper, id/reference generation, structured logging |

**Why services own the SQL.** Routes stay thin and testable; a rule like "a seat may not be sold
twice" lives next to the transaction that protects it instead of being smeared across handlers.
`movieService`, `showService`, `seatService`, `bookingService` and `adminService` are the only modules
that import `db/pool.js` (plus the auth routes, which are three-line queries).

**Money never floats.** Prices are `DECIMAL(8,2)` in MySQL and every calculation is done in integer
paise (`Math.round(rupees * 100)`), then divided back once for display. The client never sends a
price, so a tampered request cannot change what is charged.

---

## Data model decisions

**Seats belong to a screen, not to a show.** With 630 screenings in the seed data, copying 2 168
seats per show would create ~1.4 million rows. Instead a seat exists once and a *booking line*
(`booking_seats`) ties a seat to a screening. Occupancy is a query, not duplicated state.

**The seat grid is generated, not hand-entered.** `screen_rows` describes the layout (row labels,
seat counts, tier per row); creating a screen generates its `seat_categories`, `screen_rows` and
`seats` rows in one transaction. An admin can also rebuild the grid (`rebuildLayout: true`) without
disturbing bookings, because layout and bookings are separate tables.

**Pricing is tiered per screen, multiplied per show.** `seat_categories.base_price` is the hall's
base price for Classic/Premium/Recliner; `shows.price_multiplier` (1.00–3.00, CHECK-enforced) makes a
prime-time Friday screening cost more than a Tuesday matinee. The seat map returns the already
multiplied price so the UI never does money math.

**Guests are first-class.** `bookings.user_id` is nullable and the customer's name/e-mail/phone are
copied onto the booking. A ticket is therefore self-contained and can be looked up by reference
alone — which is exactly what the confirmation screen and "find my tickets" need.

**Enumerations where the set is fixed.** `bookings.status`, `payments.method`, `shows.status`,
`movies.certificate`, `screens.screen_type` and `booking_seats.category_code` are MySQL `ENUM`s:
invalid states are unrepresentable, and reporting can `GROUP BY` them directly.

**Views for reading, tables for writing.** `vw_show_occupancy` and `vw_booking_tickets` encapsulate
the two heaviest read shapes (occupancy badges, printable tickets) so the same join is not re-derived
in five places.

---

## Concurrency: seat holds and the double-booking guard

This is the part a booking system actually has to get right, so it has **three independent layers**:

### 1. A pessimistic lock per show (the coordinator)

`POST /api/bookings` runs inside one transaction that starts with:

```sql
SELECT id, status, show_date, start_time, price_multiplier
  FROM shows WHERE id = :showId
 FOR UPDATE;
```

Locking the **show** rather than the seats gives a single serialisation point per screening: two
customers booking different seats in the same hall briefly queue, while bookings for other halls run
in parallel. Inside the lock the service re-reads which seats are still free and rejects the request
with `409 SEATS_UNAVAILABLE` if any are gone, so a stale seat map can never cause an oversell.

### 2. A unique index (the guarantee)

Application locks can be bypassed by a bug, a second process or a DBA with a console. The schema
therefore makes the invariant structural:

```sql
active_seat_key TINYINT UNSIGNED
  GENERATED ALWAYS AS (CASE WHEN status IN ('CANCELLED','EXPIRED') THEN NULL ELSE 1 END) STORED,
UNIQUE KEY uq_booking_seats_show_seat (show_id, seat_id, active_seat_key)
```

Because MySQL treats `NULL`s as distinct, a seat may have unlimited cancelled/expired history but
**exactly one live line**. A concurrent insert loses with `ERROR 1062`, the transaction rolls back,
and the API maps that to `409 SEATS_UNAVAILABLE`. Verified by direct SQL and by a six-way concurrent
booking test.

### 3. Time limits (the cleanup)

A `PENDING` booking is a hold with `expires_at = now + BOOKING_HOLD_MINUTES`. `sp_release_expired_holds()`
promotes abandoned holds to `EXPIRED` and expires their seat lines (which nulls `active_seat_key`,
freeing the seats). It is called before every seat-map read and every booking attempt — so a stale
seat can never be shown as taken — and `server.js` additionally sweeps every 60 seconds, so
abandoned holds are released even when nobody is browsing. No external cron job or worker process is
needed.

**Payment is idempotent.** `payBooking` locks the booking row, returns early if it is already
`CONFIRMED` (same ticket, no second charge), refuses a `CANCELLED` booking and refuses an `EXPIRED`
one with `409 HOLD_EXPIRED`. Cancelling releases the seats immediately and marks a captured payment
`REFUNDED`.

**Seat status is derived, never stored twice.** The seat map computes `AVAILABLE` / `BOOKED` /
`BLOCKED` from `seats.is_active` plus the existence of a live `booking_seats` row — so a freed seat
is bookable the instant it is released, with no cache to invalidate.

---

## Error handling

One `ApiError` type carries an HTTP status, a stable machine-readable `code` and an optional
`details[]`. Services throw; `errorHandler` serialises:

```json
{ "error": { "code": "SEATS_UNAVAILABLE", "message": "Seats A05, A06 are no longer available.", "details": [] } }
```

Stable codes let the UI react precisely (the seat map re-fetches on `SEATS_UNAVAILABLE`, shows the
hold countdown on `HOLD_EXPIRED`) without string-matching English. Unexpected exceptions become
`500 INTERNAL_ERROR` with a generic message; the stack trace goes to the server log only, and the
logger writes one compact line per request with method, path, status and duration.

---

## Frontend architecture

```
main.jsx
└── App.jsx  ── ToastProvider ── AuthProvider ── BookingProvider ── BrowserRouter
     ├── Navbar / Footer / AiAssistant (global)
     └── Routes
          ├── /                     HomePage           catalogue, filters, hero, AI strip
          ├── /movies/:idOrSlug     MovieDetailsPage   metadata + showtimes by theatre/date
          ├── /shows/:id/seats      SeatSelectionPage  interactive hall map + running total
          ├── /checkout             CheckoutPage       customer details + payment step
          ├── /confirmation/:ref    ConfirmationPage   animated success + QR ticket
          ├── /my-bookings          MyBookingsPage     e-mail lookup, ticket view, cancel
          └── /admin/*              AdminLayout        guards on AuthContext, then
                                                       Dashboard · Movies · Theatres · Shows · Bookings · Customers
```

**State is deliberately minimal.** Three context providers:

| Provider | Owns |
|---|---|
| `ToastContext` | Transient success/error notifications (one of the few places a portal is used) |
| `AuthContext` | Admin session: token in `localStorage`, `ready` flag for the restore round-trip, `login`/`logout` |
| `BookingContext` | In-progress booking: movie, show, selected seats, customer — survives navigation from seats → checkout → confirmation |

Everything else is local component state fetched with the `useAsync` hook (`data`, `loading`,
`error`, `reload`). No global store, no caching library: the app is small enough that a cache would
add invalidation bugs rather than remove work.

**One API client.** `api/client.js` is the only module that calls `fetch`. It builds URLs, parses the
`{ data }` envelope into thrown `ApiError`s, and decides which requests carry the admin token — only
`/api/admin/*`. There is no place in the frontend where a token could be attached to an AI or
public request by accident.

**A hand-written design system** (`styles/tokens.css` → `base.css` → `components.css` → `pages.css`)
instead of a UI kit: design tokens (colour, spacing, elevation, radii) feed a small set of primitives
in `components/ui.jsx` (`Button`, `Badge`, `Card`, `Skeleton`, `EmptyState`, `Field`…), so the
cinematic look is consistent and the bundle stays ~320 kB (96 kB gzipped) with no component library.

**Interaction details that sell it**: a hero carousel, seat-map hover/selection micro-animations,
skeletons instead of spinners, a hold countdown, confetti + a drawn checkmark on confirmation, poster
art generated as deterministic SVGs locally (no external image requests, works offline), and layouts
that reflow to a 390 px viewport.

---

## Security

| Risk | Mitigation |
|---|---|
| Secret leakage | `OPENROUTER_API_KEY`, DB credentials and `JWT_SECRET` are read only in `config/env.js`; the browser bundle contains no secrets and never calls a third party |
| Committing credentials | `.env` is git-ignored; `.env.example` ships placeholders (`!.env.example` keeps it tracked) |
| Password storage | bcrypt (cost 10); hashes are never selected into an API response |
| Account enumeration | Identical `401 INVALID_CREDENTIALS` for unknown e-mail and wrong password; `users.email` uniqueness is the only place existence is observable |
| Privilege escalation | `requireAdmin` verifies the JWT **role** server-side on every `/api/admin/*` route — hiding the UI is convenience, not the boundary |
| Production secrets | `assertProductionSecrets()` refuses to boot with a fallback `JWT_SECRET` or empty `DB_PASSWORD` |
| SQL injection | Every query is parameterised through mysql2 (`:named` bindings or `?` placeholders); dynamic SQL only ever interpolates a whitelisted column name |
| Payload abuse | JSON/urlencoded bodies capped at 200 kB; request schemas bound every string, array and numeric range |
| Stale cached responses | `Cache-Control: no-store` on `/api` + ETags disabled, so a protected response can never be replayed from the browser cache |
| Price tampering | Amounts are computed server-side from seat categories and show multipliers; a client-sent price is ignored |
| Error leakage | Unknown failures return `500 INTERNAL_ERROR` with a generic message; details stay in the server log |
| CORS | Explicit origin allow-list from `CORS_ORIGINS` in production |

The frontend cannot be the security boundary by construction: it holds only an admin JWT (a token the
server issued and re-verifies), and every state-changing rule is re-checked in the service layer and
again in the database.

---

## The AI layer

The AI features are **optional and isolated** — the booking system is complete and correct with
`OPENROUTER_API_KEY` empty, which is the default in `.env.example`.

```
routes/ai.routes.js
      │  (validation + HTTP only)
      ▼
services/ai/aiService.js          ← orchestration & prompts
      │        │
      │        └────────────► services/ai/fallbackMatcher.js   deterministic, no network
      ▼
services/ai/openrouterClient.js   ← the ONLY module that knows OpenRouter exists
      │
      ▼
OpenRouter  (model = process.env.OPENROUTER_MODEL)
```

**Swapping the model is an env change, not a code change.** `openrouterClient.js` takes the model,
base URL, timeout, token cap and temperature from `config/env.js`, and nothing else in the codebase
names a model.

**The model is never trusted for facts.** `aiService` asks for structured JSON, then re-hydrates
every id against MySQL: a movie the model invented is dropped, and a suggestion with no matching film
becomes plain text. Recommendations can therefore only ever contain real, currently-scheduled films.

**Degradation is a designed path, not a crash.** No key, a timeout, a rate limit or malformed JSON
all land in the same place: the deterministic `fallbackMatcher` produces results from the database,
the response sets `source: "fallback"` and carries a human `notice`, and the UI renders that notice.
Every AI endpoint answers `200` with usable data. `GET /api/ai/status` lets the UI say whether AI is
live without spending a token.

**The key never reaches the browser.** The frontend calls `/api/ai/*` on our own API; the OpenRouter
request is made server-to-server. No key, prefix, model credential or provider header is ever
serialised into a response.

---

## Configuration

`config/env.js` resolves values in the order **`backend/.env` → project-root `.env` → real
environment**, coercing strings into typed config (`bool`, `int`) once. Two consequences worth
noting:

- Overriding a value for a single run is trivial, which is how the test suite points at a throwaway
  database without touching `.env` (`DB_PORT=3307 npm test`).
- Nothing downstream re-reads `process.env`, so there is exactly one place to audit for how a
  setting reaches the application.

`database/schema.sql` and `database/seed.sql` are dependency-free plain SQL, run by
`backend/src/db/migrate.js` — a ~100-line runner that understands `DELIMITER //` blocks (needed for
triggers and the stored procedure), splits statements safely and reports timing. That keeps the
database setup working with MySQL Workbench, the `mysql` CLI or `npm run db:reset`, with no ORM and
no migration framework to learn.

---

## Testing strategy

`backend/src/tests/api.test.js` — **18 integration tests** run against a **real MySQL 8 instance
and a real HTTP server** on an ephemeral port. Nothing is mocked: the tests exercise the same
middleware, transactions, triggers and constraints that production would.

Coverage highlights:

- catalogue filtering, search, pagination and movie detail
- seat-map shape: rows, tiers, per-seat status, pricing rules
- booking lifecycle: hold → pay → ticket, cancel → seats released → rebookable
- idempotent payment (a second `pay` does not double-charge)
- validation, auth and admin authorization failures
- admin CRUD, including screen creation generating its seat grid
- **the concurrency race**: six simultaneous bookings for one seat → exactly one `201`, five
  `409 SEATS_UNAVAILABLE`, and exactly one live `booking_seats` row afterwards

The suite skips itself with a clear message when MySQL is unreachable, so `npm test` never produces a
misleading red on a machine without a database. Database-level invariants were additionally verified
by direct SQL (duplicate live seat → `1062`, seat on a completed show → `45000`, edited confirmed
amounts → `45000`, bad runtime → `3819`, `sp_release_expired_holds()` → freed seats).

---

## Trade-offs and what we would do next

| Decision | Why | What it costs |
|---|---|---|
| Plain SQL over an ORM | The schema is the interesting part of a database project; raw SQL keeps the generated-column guard and triggers visible | More typing in services, manual row mapping |
| Pessimistic show-level lock | Simple to reason about, and the seat map is read-heavy enough that lock contention is negligible | Bookings for the same show serialise |
| Holds in the same `bookings` table | No extra table, no worker: expiry is a status plus a procedure | Seat-map reads must treat live lines as taken |
| JWT in `localStorage` for admin | Simple, and the admin console is a separate area of the app | XSS-sensitive; a cookie + CSRF token would be the production choice |
| Simulated payment gateway | A college project must not touch real money | Real integration (Razorpay/Stripe) is a separate exercise |
| Hand-written CSS | Total control of a bespoke cinematic look, no design-system drift | More CSS to maintain than Tailwind classes |

Obvious next steps: refresh tokens with an httpOnly cookie, seat-map streaming for live updates,
email/SMS ticket delivery, refund policies with partial cancellation, per-show dynamic pricing, and
row-level locking on `seats` if a single hall ever needs parallel writes.
