# 🎬 CINEVERSE — Movie Ticket Booking System

A full-stack movie ticket booking platform built as a college project: **MySQL** for the data,
**Node.js + Express** REST API for the backend, and **React + Vite** for a cinematic, responsive
frontend. It behaves like a real booking site — browse films, pick a city and showtime, choose
seats in an interactive hall map, pay, and walk away with a scannable digital ticket.

> **Not a CRUD demo.** The interesting parts are a seat-hold model that survives concurrency,
> database-level guarantees (unique indexes, triggers, CHECK constraints), a bespoke design
> system instead of a component kit, and an **optional** OpenRouter AI layer that degrades
> gracefully to a local matcher when no API key is present.

| | |
|---|---|
| **Database** | MySQL 8.0 (13 tables, 2 views, 2 triggers, 1 stored procedure) |
| **Backend** | Node.js 18+, Express 4, mysql2, zod, bcryptjs, jsonwebtoken |
| **Frontend** | React 18, React Router 6, Vite 5, hand-written CSS design system |
| **AI (optional)** | OpenRouter, model configurable via `OPENROUTER_MODEL` |
| **Tests** | 18 integration tests against a real MySQL 8 instance, including a 6-way booking race |

---

## ✨ Feature highlights

### Customer experience
- **Hero carousel** of featured films with backdrop art and trailer links.
- **Catalogue** with search (title, cast, director, synopsis via a MySQL `FULLTEXT` index),
  genre chips, language and certificate filters, sorting, and pagination.
- **Movie detail pages** — synopsis, cast, runtime, certificate, rating and an availability
  block that shows how full each showtime already is.
- **City → theatre → showtime** selection with live seat counts per screening.
- **Interactive seat map** — row-by-row hall layout with category tiers (Recliner / Premium /
  Classic) colour-coded, live available / selected / occupied states, keyboard-accessible seats,
  a running total, and a per-booking seat limit.
- **Seat holds** — choosing seats creates a `PENDING` booking with a 10-minute expiry; seats are
  locked for you while you finish checkout and released automatically if you abandon it.
- **Checkout** — customer details prefill, fee breakdown in integer paise (no floating-point
  money bugs), simulated card / UPI / wallet payment step.
- **Confirmation screen** with animated check + confetti, a **unique booking reference**
  (`CV-XXXX-XXXX`), and a **digital ticket** with a real QR code.
- **My Bookings** — look up tickets by e-mail, open a ticket, or cancel and release seats.
- **Mobile-first layouts** — the whole flow works down to a 390 px viewport.

### Admin console
- Separate sign-in (`/admin/login`) issuing a JWT; every admin route is guarded server-side.
- **Dashboard** — revenue, bookings by status, occupancy, top films, recent activity.
- **Movies** — create / edit / delete with genre tagging, full metadata and validation.
- **Theatres & screens** — creating a screen also generates its pricing tiers, row layout and
  seat grid in one transaction.
- **Shows** — schedule screenings per screen and date with automatic time-overlap rules.
- **Bookings** — filter by status, inspect seats and payments, cancel with refund.
- **Customers** — booking history and spend per customer.

### AI layer (optional, never required)
- **Recommendations** — "a funny action movie around two hours" → ranked films with a rationale.
- **Natural-language search** — plain English/SQL-free queries resolved against MySQL.
- **In-app assistant** — answers questions about films, showtimes and how booking works.
- **Graceful degradation** — with no API key, every AI endpoint still returns HTTP 200 with
  database-verified results plus a clear `notice`, and the UI shows that notice instead of an error.

---

## 📸 Screenshots

All screenshots are of the running application, captured by [`scripts/screenshots.mjs`](scripts/screenshots.mjs)
driving a real browser through the real booking flow. See [`docs/screenshots/`](docs/screenshots).

| Customer flow | |
|---|---|
| ![Home](docs/screenshots/01-home-hero.png) **Home — hero** | ![Now showing](docs/screenshots/02-home-now-showing.png) **Now showing** |
| ![AI recommendations](docs/screenshots/03-home-ai-recommendations.png) **AI recommendations** | ![Genre filter](docs/screenshots/04-home-genre-filter.png) **Genre filtering** |
| ![AI search](docs/screenshots/05-home-ai-search.png) **Natural-language search** | ![Movie details](docs/screenshots/06-movie-details.png) **Movie details** |
| ![Showtimes](docs/screenshots/07-theatres-showtimes.png) **Theatres & showtimes** | ![Seat map](docs/screenshots/08-seat-selection.png) **Seat selection** |
| ![Seat tiers](docs/screenshots/09-seat-categories.png) **Seat categories** | ![Checkout](docs/screenshots/10-checkout-details.png) **Checkout** |
| ![Payment](docs/screenshots/11-checkout-payment.png) **Payment step** | ![Confirmed](docs/screenshots/12-booking-confirmed.png) **Booking confirmed** |
| ![Ticket](docs/screenshots/13-digital-ticket.png) **Digital ticket + QR** | ![My bookings](docs/screenshots/14-my-bookings.png) **My bookings** |

| AI, admin & mobile | |
|---|---|
| ![Assistant](docs/screenshots/15-ai-assistant.png) **AI assistant** | ![Admin login](docs/screenshots/16-admin-login.png) **Admin sign-in** |
| ![Admin dashboard](docs/screenshots/17-admin-dashboard.png) **Admin dashboard** | ![Admin movies](docs/screenshots/18-admin-movies.png) **Manage movies** |
| ![Admin theatres](docs/screenshots/19-admin-theatres.png) **Manage theatres & screens** | ![Admin bookings](docs/screenshots/20-admin-bookings.png) **Manage bookings** |
| ![Mobile home](docs/screenshots/21-mobile-home.png) **Mobile — home** | ![Mobile showtimes](docs/screenshots/22-mobile-showtimes.png) **Mobile — showtimes** |

---

## 🚀 Quick start

### Prerequisites
- **Node.js 18.18+** (developed on Node 22)
- **MySQL 8.0+** running locally, or Docker: `docker run -d --name moviebook-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=yourpassword mysql:8.0`

### 1. Install
```bash
git clone <your-repo-url> movie-ticket-booking
cd movie-ticket-booking

cp .env.example .env      # then edit the DB_* values
npm run setup             # installs root + backend + frontend deps, then loads the schema
```

`npm run setup` = `npm install` → `install:all` → `db:reset`.
`db:reset` runs [`database/schema.sql`](database/schema.sql) (drops and recreates the `cineverse`
database) and then [`database/seed.sql`](database/seed.sql) (12 films, 5 theatres, 630 screenings,
2 168 seats, 26 demo bookings). Both files are dependency-free plain SQL — you can also open them
in MySQL Workbench or run them with the `mysql` CLI.

### 2. Run
```bash
npm run dev
```
- API → http://localhost:5000  (health check at `/api/health`)
- Web → http://localhost:5173

Vite proxies `/api` to the backend in development, so no CORS or base-URL configuration is needed.

### 3. Sign in as admin
Open http://localhost:5173/admin/login

| Role | E-mail | Password |
|---|---|---|
| **Admin** | `admin@cineverse.dev` | `admin123` |
| Customer | `demo@cineverse.dev` | `password123` |

> Customer booking does **not** require an account — checkout is guest-friendly. The customer
> login exists so you can demonstrate authentication and registered-user ticketing.

---

## 🔧 Environment variables

Everything is documented in [`.env.example`](.env.example); `.env` is git-ignored.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API port |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed browser origins |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `127.0.0.1` / `3306` / `root` / *(empty)* / `cineverse` | MySQL connection |
| `JWT_SECRET` | dev fallback | Signing key for admin/user tokens — **set this in production** |
| `JWT_EXPIRES_IN` | `12h` | Token lifetime |
| `CONVENIENCE_FEE_PERCENT` | `5` | Booking fee |
| `BOOKING_HOLD_MINUTES` | `10` | Seat-hold window |
| `MAX_SEATS_PER_BOOKING` | `10` | Per-booking seat cap |
| `SIMULATE_PAYMENTS` | `true` | Demo gateway (no real money moves) |
| `PAYMENT_FAILURE_RATE` | `0` | Optional: force some payments to fail, to demo the failure path |
| `OPENROUTER_API_KEY` | *(empty)* | **Server-side only.** Empty = AI falls back, everything else works |
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` | Any OpenRouter model id — change it without touching code |
| `OPENROUTER_BASE_URL` / `_TIMEOUT_MS` / `_MAX_TOKENS` / `_TEMPERATURE` | OpenRouter defaults | Tuning knobs for the AI client |
| `VITE_API_BASE_URL` | *(empty)* | Only needed if you deploy the frontend separately |

---

## 📜 npm scripts

| Command | What it does |
|---|---|
| `npm run setup` | Install everything and load schema + seed data |
| `npm run dev` | Run API and web dev server together |
| `npm run dev:api` / `npm run dev:web` | Run them individually |
| `npm run db:reset` | Recreate the schema **and** reseed (`db:setup` = schema only, `db:seed` = seed only) |
| `npm run build` | Production build of the frontend into `frontend/dist` |
| `npm start` | Start the API in production mode |
| `npm test` | 18 backend integration tests (real MySQL + real HTTP) |
| `npm run verify` | Posters + production build + tests |
| `npm run posters` | Regenerate the deterministic SVG poster art |
| `npm run screenshots` | Re-capture `docs/screenshots/` from the running app |
| `npm run er-diagram` | Re-render the Mermaid ER diagram to `docs/er-diagram.svg` |

---

## 🗂 Project structure

```
movie-ticket-booking/
├── database/
│   ├── schema.sql              # 13 tables, FKs, CHECKs, FULLTEXT, 2 triggers, 1 procedure, 2 views
│   └── seed.sql                # deterministic sample data (films, halls, seats, shows, bookings)
├── backend/
│   └── src/
│       ├── server.js  app.js  config/env.js
│       ├── db/          pool.js (query/transaction helpers), migrate.js, sqlFile.js
│       ├── routes/      movies, catalogue, bookings, auth, ai, admin
│       ├── services/    movie, show, seat, booking, admin  +  ai/{openrouterClient,fallbackMatcher,aiService}
│       ├── middleware/  auth (JWT), validate (zod), errorHandler
│       ├── schemas/     every request body/query/param contract
│       ├── utils/       errors, asyncHandler, ids, logger
│       └── tests/       api.test.js
├── frontend/
│   ├── public/posters/          # generated SVG artwork (offline, no external requests)
│   └── src/
│       ├── api/client.js        # single fetch wrapper; admin token attached only to /api/admin/*
│       ├── context/             # Toast, Booking, Auth providers
│       ├── hooks/               # useAsync, useCity
│       ├── components/          # Navbar, HeroCarousel, MovieCard, SeatMap, TicketView, AiAssistant …
│       ├── pages/               # Home, MovieDetails, SeatSelection, Checkout, Confirmation, MyBookings
│       ├── pages/admin/         # AdminLogin, AdminLayout, Dashboard, Movies, Theatres, Shows, Bookings, Customers
│       └── styles/              # tokens → base → components → pages (hand-written design system)
├── docs/
│   ├── API.md                   # every endpoint, with request/response examples
│   ├── ARCHITECTURE.md          # layers, data model, concurrency, security, AI design
│   ├── ER_DIAGRAM.md            # Mermaid ER diagram + relationship notes
│   └── screenshots/             # 22 captured screens
└── scripts/                     # poster generator + screenshot capture
```

---

## 🎟 How the booking flow actually works

1. **Pick a show** → `GET /api/movies/:slug/shows?date=…` returns theatres, showtimes and live
   seat availability for one date.
2. **Load the hall** → `GET /api/shows/:id/seats` returns rows, seat categories with prices and a
   status per seat (`AVAILABLE` / `BOOKED` / `BLOCKED`). Taken seats come from `booking_seats`
   rows belonging to live bookings only.
3. **Hold seats** → `POST /api/bookings` opens a transaction, takes a `SELECT … FOR UPDATE` lock on
   the show, re-checks every seat, then inserts a `PENDING` booking with `expires_at = now + 10 min`
   and one `booking_seats` row per seat. If any seat was taken in between, it returns
   **409 `SEATS_UNAVAILABLE`** and nothing is written.
4. **Pay** → `POST /api/bookings/:reference/pay` flips the booking to `CONFIRMED`, stores the
   payment row and returns the ticket. It is idempotent, so a retry cannot double-charge.
5. **Ticket** → the reference (`CV-XXXX-XXXX`) is the bearer key for the ticket; the confirmation
   screen renders a QR code, and `GET /api/bookings/:reference` is public for exactly that reason.
6. **Cancel** → `POST /api/bookings/:reference/cancel` releases the seats (so they become bookable
   again immediately) and refunds the captured payment.

### Correctness guarantees that live in the database, not just the API
- `UNIQUE (show_id, seat_id, active_seat_key)` on `booking_seats`, where `active_seat_key` is a
  **generated column** that is `NULL` (and therefore non-conflicting) once a booking is cancelled or
  expired. A duplicate *live* seat is impossible — verified as `ERROR 1062` at the SQL level.
- A trigger rejects `booking_seats` rows for screenings that are not on sale (`SIGNAL SQLSTATE 45000`).
- A trigger freezes the money columns once a booking is confirmed.
- `CHECK` constraints on money arithmetic, ratings, runtimes, screen geometry and email shape.
- `sp_release_expired_holds()` sweeps abandoned `PENDING` bookings back to `EXPIRED` and frees seats.

---

## 🧪 Testing

```bash
npm test          # 18 integration tests
```

The suite boots the real Express app against a real MySQL 8 instance over HTTP — no mocks — and
covers the catalogue, seat maps, the full booking → pay → cancel lifecycle, validation errors,
auth, admin CRUD, and the concurrency guarantee:

> **Six simultaneous requests for the same seat**: exactly **one** wins and **five** get
> `409 SEATS_UNAVAILABLE`, and exactly one live `booking_seats` row exists afterwards.

Database-level behaviour is also asserted directly in SQL (duplicate seat insert → `1062`,
booking on a completed show → `45000`, edited confirmed amounts → `45000`, bad runtime → `3819`).

---

## 🔐 Security

- `OPENROUTER_API_KEY`, DB credentials and `JWT_SECRET` are read **only on the server**
  (`backend/src/config/env.js`). The browser bundle contains no secrets — the frontend never talks
  to OpenRouter or MySQL, only to our REST API.
- `.env` is git-ignored; [`.env.example`](.env.example) ships placeholders only.
- Passwords are stored as bcrypt hashes (never plaintext, never returned by any endpoint).
- Login failures return one generic message so account existence is not leaked.
- Admin routes are guarded twice: the UI hides them, and `requireAdmin` verifies the JWT role
  server-side (`403 ADMIN_REQUIRED` otherwise).
- Production refuses to start with a missing `JWT_SECRET` or `DB_PASSWORD`
  (`assertProductionSecrets`).
- API responses are sent with `Cache-Control: no-store` so a protected response can never be
  replayed from the browser cache.

---

## 🤖 AI layer (optional)

`backend/src/services/ai/` is deliberately modular:

| File | Role |
|---|---|
| `openrouterClient.js` | The only module that knows OpenRouter: request shape, timeouts, JSON-mode parsing, error mapping |
| `aiService.js` | Prompting and orchestration — recommends, searches, chats, then **re-hydrates every id from MySQL** so the model can never invent a film |
| `fallbackMatcher.js` | Deterministic keyword/genre/duration matcher used when the model is unavailable |

```bash
# Enable AI (optional) — everything works without it
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o-mini     # swap models freely, no code changes
```

Endpoints: `GET /api/ai/status`, `POST /api/ai/recommend`, `POST /api/ai/search`,
`POST /api/ai/assistant`. With no key configured they return HTTP 200, database-verified films, a
`notice` explaining that AI is off, and `source: "fallback"` — the booking flow is untouched.

---

## 📚 Documentation

- **[docs/API.md](docs/API.md)** — every REST endpoint with parameters, examples and error codes.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — layers, request lifecycle, schema rationale,
  concurrency and seat-hold design, security model, frontend architecture.
- **[docs/ER_DIAGRAM.md](docs/ER_DIAGRAM.md)** — Mermaid ER diagram of all 13 tables plus
  relationship/cardinality notes, with a rendered [docs/er-diagram.svg](docs/er-diagram.svg).
- **[database/schema.sql](database/schema.sql)** — heavily commented DDL, the real source of truth.

---

*Built with Node.js, Express, MySQL 8 and React 18.*
