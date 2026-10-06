# CINEVERSE — REST API Reference

Base URL: `http://localhost:5000/api` · All responses are JSON (`application/json; charset=utf-8`).

```
Content-Type: application/json
```

- [Conventions](#conventions)
- [Health](#health)
- [Movies & catalogue](#movies--catalogue)
- [Showtimes & seat maps](#showtimes--seat-maps)
- [Bookings](#bookings)
- [Authentication](#authentication)
- [AI features](#ai-features-optional)
- [Admin](#admin)
- [Error reference](#error-reference)

---

## Conventions

**Success envelope.** Single resources are wrapped in `data`; list endpoints add `meta`.

```json
{ "data": { "id": 7, "title": "Kalari: Rise of the Warrior" } }
{ "data": [ ... ], "meta": { "count": 12 } }
{ "data": { ... }, "message": "Payment successful.", "meta": { "holdMinutes": 10 } }
```

**Errors** always use the same body, so the UI can render one error path:

```json
{ "error": { "code": "SEATS_UNAVAILABLE", "message": "Seats A05, A06 are no longer available.", "details": [] } }
```

**Validation** happens before any handler runs (zod). A failed body/query/param check returns
`400 VALIDATION_ERROR` with per-field `details`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data",
    "details": [{ "path": "customer.email", "message": "Enter a valid e-mail address" }]
  }
}
```

**Dates and money.** Dates are `YYYY-MM-DD`, times `HH:MM[:SS]`, timestamps are UTC ISO-8601.
All money is **INR** and is calculated server-side in integer paise, so `total_amount` is always
`subtotal + convenience_fee` exactly — the client never sends a price.

**Caching.** Every `/api` response carries `Cache-Control: no-store` and ETags are disabled, so a
protected response can never be replayed from the browser cache.

**Auth.** Admin routes expect `Authorization: Bearer <jwt>`. The token is issued by
`POST /api/auth/login`; the frontend stores it under `cineverse.admin.token` and attaches it only
to `/api/admin/*` calls.

---

## Health

### `GET /api/health`

Readiness probe: reports MySQL connectivity, table count, whether the schema is complete
(≥ 13 tables) and whether the AI layer is configured. Returns **200** when healthy, **503** when
the schema is missing or the database is unreachable.

```json
{
  "status": "ok",
  "service": "cineverse-api",
  "version": "1.0.0",
  "environment": "development",
  "uptimeSeconds": 1059,
  "database": { "connected": true, "tables": 15, "latencyMs": 26, "schemaReady": true },
  "ai": { "enabled": false, "model": null },
  "hints": [],
  "timestamp": "2026-10-06T06:10:53.311Z"
}
```

---

## Movies & catalogue

### `GET /api/movies`

Filterable, sortable, paginated catalogue.

| Query | Type | Notes |
|---|---|---|
| `status` | `now_showing` \| `upcoming` \| `archived` | Defaults to `now_showing` |
| `genre` | string | Genre slug, e.g. `action` |
| `search` | string | Matches title, cast, director and synopsis (MySQL `FULLTEXT` index) |
| `language` | string | Exact language name |
| `city` | string | Only films actually screening in that city |
| `sort` | `popular` \| `rating` \| `newest` \| `oldest` \| `title` | Default `popular` |
| `featured` | `true` \| `false` | Hero-carousel selection |
| `page` / `limit` | int | `limit` ≤ 50 |

```bash
curl "http://localhost:5000/api/movies?status=now_showing&genre=action&sort=rating&limit=2"
```

```json
{
  "data": [
    {
      "id": 2,
      "title": "Kalari: Rise of the Warrior",
      "slug": "kalari-rise-of-the-warrior",
      "synopsis": "A 17th century Kalaripayattu master trains an orphaned stable girl …",
      "durationMinutes": 155,
      "durationLabel": "2h 35m",
      "language": "Malayalam",
      "certificate": "UA",
      "rating": 8.8,
      "voteCount": 41220,
      "director": "Rohit Varma",
      "cast": ["Aditi Menon", "Pranav Nambiar", "Suresh Pillai"],
      "posterUrl": "/posters/kalari.svg",
      "backdropUrl": "/posters/kalari.svg",
      "trailerUrl": "https://example.com/trailers/kalari",
      "releaseDate": "2026-09-23",
      "status": "now_showing",
      "isFeatured": true,
      "genres": [{ "name": "Action", "slug": "action" }, { "name": "Drama", "slug": "drama" }],
      "upcomingShowCount": 62
    }
  ],
  "meta": { "page": 1, "limit": 1, "total": 12, "totalPages": 12, "sort": "popular" }
}
```

### `GET /api/movies/featured?limit=5`

Featured films for the hero carousel (`limit` ≤ 10).

### `GET /api/movies/:idOrSlug`

One film by numeric id **or** slug, plus an aggregate `stats` block (bookings, seats sold,
occupancy, revenue) used on the movie page. → `404 MOVIE_NOT_FOUND`.

### `GET /api/genres`

Genre chips with a `movieCount` each.

### `GET /api/languages`

Distinct languages with counts.

### `GET /api/cities`

Cities that have active theatres, with theatre and screen counts.

---

## Showtimes & seat maps

### `GET /api/movies/:idOrSlug/shows`

Showtimes grouped by theatre for one date, with live availability.

| Query | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | Defaults to today; also returns `dates[]` (next 7 days) for the date strip |
| `city` | string | Filter to one city |
| `theatreId` | int | Filter to one theatre |

```json
{
  "data": {
    "movie": { "id": 2, "title": "Kalari: Rise of the Warrior", "durationMinutes": 155 },
    "date": "2026-10-06",
    "dates": [{ "date": "2026-10-06", "label": "Today", "isToday": true }],
    "theatres": [
      {
        "id": 5,
        "name": "Sri Sai Cinemas 4K",
        "city": "Vijayawada",
        "address": "MG Road, Gandhi Nagar, Vijayawada 520003",
        "amenities": ["Parking", "Dolby Atmos", "Recliners"],
        "rating": 4.4,
        "screens": [
          {
            "id": 12,
            "name": "Balcony",
            "screenType": "2D",
            "shows": [
              {
                "id": 428,
                "startTime": "18:45:00",
                "endTime": "21:20:00",
                "language": "Malayalam",
                "priceMultiplier": 1.4,
                "status": "scheduled",
                "totalSeats": 72,
                "availableSeats": 51,
                "occupancyPercent": 29.2,
                "minPrice": 210
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### `GET /api/shows/:id`

One screening with its movie, theatre and screen.

### `GET /api/shows/:id/seats`

**The seat-selection payload.** Expired holds are swept first, so an abandoned checkout never
looks like a sold seat.

- `data.show` — the screening, with `isPast`, `status` and the price multiplier applied.
- `data.categories` — pricing tiers, cheapest first (`CLASSIC`, `PREMIUM`, `RECLINER`), each with
  `basePrice`, the multiplier-adjusted `price`, `colorHex` and `seatCount`.
- `data.rows[].seats[]` — every seat with `id`, `label` (`A07`), `rowLabel`, `seatNumber`,
  `categoryCode`, `price` and `status`.
- `data.summary` / `data.categorySummary` — totals for the legend and progress bar.
- `data.rules` — `maxSeats` (10), `holdMinutes` (10) and `minSeats`.
- `data.pricing` — `convenienceFeePercent`, currency and seat cap, so the UI never hardcodes a fee.

```json
{
  "data": {
    "show": {
      "id": 428,
      "showDate": "2026-10-06",
      "startTime": "18:45:00",
      "endTime": "21:20:00",
      "language": "Malayalam",
      "status": "scheduled",
      "priceMultiplier": 1.4,
      "isPast": false,
      "movie": { "id": 2, "title": "Kalari: Rise of the Warrior", "durationMinutes": 155, "certificate": "UA" },
      "theatre": { "id": 5, "name": "Sri Sai Cinemas 4K", "city": "Vijayawada", "address": "MG Road, …" },
      "screen": { "name": "Balcony", "screenType": "2D" }
    },
    "categories": [
      { "code": "CLASSIC", "label": "Classic", "colorHex": "#5b8def", "basePrice": 150, "price": 210, "seatCount": 54 },
      { "code": "PREMIUM", "label": "Premium", "colorHex": "#a855f7", "basePrice": 220, "price": 308, "seatCount": 18 }
    ],
    "rows": [
      {
        "rowLabel": "A",
        "categoryCode": "CLASSIC",
        "categoryLabel": "Classic",
        "price": 210,
        "seats": [
          { "id": 901, "label": "A01", "rowLabel": "A", "seatNumber": 1, "categoryCode": "CLASSIC", "price": 210, "status": "AVAILABLE" },
          { "id": 902, "label": "A02", "rowLabel": "A", "seatNumber": 2, "categoryCode": "CLASSIC", "price": 210, "status": "BOOKED" },
          { "id": 903, "label": "A03", "rowLabel": "A", "seatNumber": 3, "categoryCode": "CLASSIC", "price": 210, "status": "BLOCKED" }
        ]
      }
    ],
    "summary": { "total": 72, "available": 51, "booked": 20, "blocked": 1 },
    "categorySummary": { "CLASSIC": { "available": 40, "booked": 13, "total": 54 } },
    "pricing": { "convenienceFeePercent": 5, "maxSeatsPerBooking": 10, "currency": "INR" },
    "rules": { "minSeats": 1, "maxSeats": 10, "holdMinutes": 10 }
  }
}
```

**Seat status semantics**

| Status | Meaning |
|---|---|
| `AVAILABLE` | Bookable right now |
| `BOOKED` | Sold **or** currently held by another customer's live checkout |
| `BLOCKED` | Taken out of service (`seats.is_active = 0`) — never selectable |

---

## Bookings

### `POST /api/bookings`

**Reserves seats and creates a `PENDING` booking (a seat hold).** Runs in one transaction that
takes a `SELECT … FOR UPDATE` lock on the show, re-validates every seat, then writes the booking and
one `booking_seats` row per seat. The database enforces
`UNIQUE (show_id, seat_id, active_seat_key)` on top of that, so a seat can never be double-sold even
if two requests arrive at the same instant.

```json
{
  "showId": 428,
  "seatIds": [901, 902],
  "customer": { "name": "Aditi Menon", "email": "aditi@example.com", "phone": "+91 98450 12345" }
}
```

Rules: `showId` must exist; **1–10 seats**; the customer's name (≥ 2 chars), a valid e-mail and phone
are required. → **201**

```json
{
  "data": {
    "id": 214,
    "reference": "CV-874Z-2ATG",
    "status": "PENDING",
    "seatCount": 2,
    "subtotal": 43000,
    "convenienceFee": 2150,
    "totalAmount": 45150,
    "currency": "INR",
    "customer": { "name": "Aditi Menon", "email": "aditi@example.com", "phone": "+91 98450 12345" },
    "expiresAt": "2026-10-06T06:28:11.000Z",
    "holdMinutes": 10,
    "seats": [{ "seatId": 901, "label": "A01", "categoryCode": "CLASSIC", "unitPrice": 21000 }],
    "show": { "id": 428, "showDate": "2026-10-06", "startTime": "18:45:00" }
  },
  "message": "Seats held for 10 minutes. Complete payment to confirm.",
  "meta": { "holdMinutes": 10 }
}
```

Money fields are **paise** on the wire (`21000` = ₹210.00). The amount is computed by the server
from the seat categories and the show's price multiplier; a client-supplied price is ignored.

| Failure | Status | Code |
|---|---|---|
| A seat is sold or held by someone else | 409 | `SEATS_UNAVAILABLE` |
| Seat belongs to a different screen | 400 | `SEATS_NOT_IN_SCREEN` |
| Seat id does not exist | 400 | `UNKNOWN_SEATS` |
| Seat is out of service | 409 | `SEATS_BLOCKED` |
| Screening cancelled, completed or in the past | 409 | `SHOW_NOT_BOOKABLE` |
| Fewer than 1 / more than 10 seats | 400 | `VALIDATION_ERROR` |

### `GET /api/bookings/:reference`

Public ticket lookup — the reference is the bearer key for the ticket, which is why the
confirmation screen can be refreshed or shared. Returns the booking, its seats and its payment.
→ `404 BOOKING_NOT_FOUND`.

### `GET /api/bookings?email=`

Ticket history for one e-mail address (the "find my tickets" form). → `{ data: [...], meta: { count } }`.

### `POST /api/bookings/:reference/pay`

Captures the payment and confirms the booking. **Idempotent**: paying an already-confirmed booking
returns the same ticket instead of charging twice.

```json
{ "method": "CARD" }
```
`method` ∈ `CARD` \| `UPI` \| `NETBANKING` \| `WALLET` (default `CARD`).

The bundled gateway is a **simulation** (`SIMULATE_PAYMENTS=true`) — no real money moves. Setting
`PAYMENT_FAILURE_RATE` makes a share of attempts fail so the failure path can be demonstrated.

| Failure | Status | Code |
|---|---|---|
| Hold expired before payment | 409 | `HOLD_EXPIRED` |
| Booking already cancelled | 409 | `BOOKING_CANCELLED` |
| Simulated gateway decline | 402 | `PAYMENT_FAILED` |

### `POST /api/bookings/:reference/cancel`

Cancels the booking, releases its seats immediately (they become bookable again) and refunds a
captured payment. Optional body: `{ "reason": "Change of plans" }`.

---

## Authentication

Admin sign-in plus optional customer accounts. Guest checkout is the norm — booking never requires
a token.

### `POST /api/auth/login`

```json
{ "email": "nihas@cineverse.dev", "password": "admin123" }
```

```json
{ "data": { "token": "eyJhbGciOi…", "user": { "id": 1, "name": "Nihas", "email": "nihas@cineverse.dev", "phone": "…", "role": "admin" } } }
```

Wrong e-mail and wrong password return the **same** `401 INVALID_CREDENTIALS`, so the API never
reveals which accounts exist. Passwords are compared against bcrypt hashes.

### `POST /api/auth/register`

Creates a `customer` account → **201** with the same `{ token, user }` shape.
→ `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`.

### `GET /api/auth/me`

Returns the signed-in user behind the bearer token (used to restore an admin session on reload).
→ `401 UNAUTHORIZED` / `403`.

---

## AI features (optional)

All four endpoints **always answer with HTTP 200**. If `OPENROUTER_API_KEY` is unset (or the model
errors), they fall back to a deterministic local matcher, set `source: "fallback"` and include a
`notice` the UI displays. No AI endpoint can create, price or confirm a booking, and every movie id
the model returns is re-validated against MySQL before it reaches the client — a model cannot invent
a film. The API key is never sent to the browser in any form.

### `GET /api/ai/status`

```json
{
  "data": {
    "enabled": false,
    "model": "openai/gpt-4o-mini",
    "message": "AI features are disabled. Set OPENROUTER_API_KEY to enable them; the booking system works fully without it."
  }
}
```

### `POST /api/ai/recommend`

```json
{ "query": "something funny and short for a weekday night", "limit": 3 }
```

```json
{
  "data": {
    "query": "something funny and short for a weekday night",
    "summary": "Three lighter picks that fit a weekday evening.",
    "source": "fallback",
    "model": null,
    "notice": "AI is not configured, so these recommendations come from Cineverse's built-in matcher.",
    "movies": [ { "id": 8, "title": "Pixel Pals", "reason": "Comedy, 108 minutes", "rating": 7.9 } ]
  }
}
```

### `POST /api/ai/search`

Natural-language search resolved against MySQL (genres, language, runtime, rating, release window).
→ `{ query, summary, filters, movies, source, notice }`.

### `POST /api/ai/assistant`

The in-app helper chat.

```json
{
  "message": "What's the cheapest way to see Kalari this weekend?",
  "history": [{ "role": "user", "content": "hi" }, { "role": "assistant", "content": "Hello!" }]
}
```
`history` is capped at 12 messages. → `{ answer, movies, suggestions, source, notice }`.

**Configuration** (server-side only): `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
`OPENROUTER_BASE_URL`, `OPENROUTER_TIMEOUT_MS`, `OPENROUTER_MAX_TOKENS`, `OPENROUTER_TEMPERATURE`.
Changing `OPENROUTER_MODEL` switches providers/models with no code change.

---

## Admin

Every route below requires `Authorization: Bearer <jwt>` where the token's role is `admin`.
The UI hides these routes, but the guard is server-side: a non-admin token gets
**403 `ADMIN_REQUIRED`**, a missing/expired token **401 `UNAUTHORIZED`**.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/stats` | Dashboard: revenue, bookings by status, occupancy, top films, recent bookings |
| `GET` | `/api/admin/movies` | Paged movie list (`search`, `status`, `page`, `limit`) |
| `GET` | `/api/admin/movies/:id` | One movie with its genres |
| `POST` | `/api/admin/movies` | Create (auto-slugs the title, resolves genres, `201`) |
| `PUT` | `/api/admin/movies/:id` | Partial update (`movieUpdateBody` = all fields optional) |
| `DELETE` | `/api/admin/movies/:id` | Delete — **409 `MOVIE_IN_USE`** if screenings exist |
| `GET` | `/api/admin/genres` | Genre options for the movie form |
| `GET` | `/api/admin/theatres` | Theatres with their screens |
| `POST` | `/api/admin/theatres` | Create theatre |
| `PUT` | `/api/admin/theatres/:id` · `DELETE` | Update / delete (delete blocked while screens exist) |
| `GET` | `/api/admin/screens?theatreId=` | Screens, optionally for one theatre |
| `POST` | `/api/admin/screens` | Create a screen **and generate its tiers, rows and seat grid in one transaction** |
| `PUT` | `/api/admin/screens/:id` · `DELETE` | Update (with `rebuildLayout: true` to regenerate the grid) / delete |
| `GET` | `/api/admin/shows` | Paged screenings (`movieId`, `theatreId`, `date`, `from`, `to`, `status`) |
| `POST` | `/api/admin/shows` | Schedule a screening — overlapping slots are rejected (`409 SHOW_OVERLAP`) |
| `PUT` | `/api/admin/shows/:id` · `DELETE` | Update / delete (delete blocked while bookings exist) |
| `GET` | `/api/admin/bookings` | Paged bookings (`status`, `search` by reference/customer, `from`/`to`) with seats and payment |
| `GET` | `/api/admin/customers` | Paged customer list with booking counts and spend |
| `GET` | `/api/admin/customers/:id` | One customer's profile and booking history |

**Create a movie**

```json
{
  "title": "The Last Monsoon",
  "synopsis": "A coastal town rebuilds after the flood that took everything but its spirit.",
  "durationMinutes": 128,
  "language": "Marathi",
  "certificate": "UA",
  "rating": 8.1,
  "director": "Ira Deshpande",
  "cast": ["Neha Kulkarni", "Sameer Joshi"],
  "releaseDate": "2026-10-10",
  "status": "upcoming",
  "isFeatured": true,
  "genres": ["Drama", "Family"],
  "posterUrl": "/posters/the-last-monsoon.svg"
}
```

**Schedule a show**

```json
{ "movieId": 12, "screenId": 7, "showDate": "2026-10-12", "startTime": "19:30", "priceMultiplier": 1.25 }
```
`endTime` is derived from the movie's runtime. `UNIQUE (screen_id, show_date, start_time)` plus an
overlap check prevent the same auditorium being double-booked; a `booking_seats` trigger refuses
seats for screenings that are not on sale.

---

## Error reference

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query/param failed schema validation (`details[]` explains each field) |
| 400 | `BAD_REQUEST` | Malformed request |
| 400 | `UNKNOWN_SEATS` / `SEATS_NOT_IN_SCREEN` | Seat ids are unknown or from another hall |
| 401 | `INVALID_CREDENTIALS` | Wrong e-mail or password (deliberately not specific) |
| 401 | `UNAUTHORIZED` | Missing, malformed or expired bearer token |
| 402 | `PAYMENT_FAILED` | The (simulated) gateway declined the payment |
| 403 | `ADMIN_REQUIRED` | Valid token, but not an administrator |
| 404 | `MOVIE_NOT_FOUND` / `SHOW_NOT_FOUND` / `BOOKING_NOT_FOUND` | Unknown resource |
| 409 | `SEATS_UNAVAILABLE` | Seats were taken between selection and checkout — **the double-booking guard** |
| 409 | `SEATS_BLOCKED` / `SHOW_NOT_BOOKABLE` / `HOLD_EXPIRED` / `BOOKING_CANCELLED` | Business-rule conflict |
| 409 | `SHOW_OVERLAP` / `EMAIL_TAKEN` / `MOVIE_IN_USE` | Conflict with existing data |
| 500 | `INTERNAL_ERROR` | Unexpected failure (details are logged server-side, never leaked) |

Unexpected failures return `INTERNAL_ERROR` with a generic message; stack traces and SQL errors stay
in the server log.

---

## Quick end-to-end example

```bash
API=http://localhost:5000/api

# 1. Find a film and its showtimes
MOVIE=$(curl -s "$API/movies?search=kalari&limit=1" | jq -r '.data[0].slug')
SHOW=$(curl -s "$API/movies/$MOVIE/shows" | jq -r '.data.theatres[0].screens[0].shows[0].id')

# 2. Look at the hall and grab two free seats
SEATS=$(curl -s "$API/shows/$SHOW/seats" | jq -c '[.data.rows[].seats[] | select(.status=="AVAILABLE")][0:2] | map(.id)')

# 3. Hold them (10-minute hold)
REF=$(curl -s -X POST "$API/bookings" -H 'Content-Type: application/json' -d "{
  \"showId\": $SHOW,
  \"seatIds\": $SEATS,
  \"customer\": { \"name\": \"Aditi Menon\", \"email\": \"aditi@example.com\", \"phone\": \"+919845012345\" }
}" | jq -r '.data.reference')

# 4. Pay and get the ticket
curl -s -X POST "$API/bookings/$REF/pay" -H 'Content-Type: application/json' -d '{"method":"UPI"}' | jq '.data.status'
# "CONFIRMED"

# 5. Ticket is public for that reference
curl -s "$API/bookings/$REF" | jq '.data.seats | map(.label)'
```
