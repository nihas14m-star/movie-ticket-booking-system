-- =============================================================================
--  CINEVERSE — Movie Ticket Booking System
--  database/seed.sql  ::  sample / demo data
-- -----------------------------------------------------------------------------
--  Run AFTER database/schema.sql. Everything here is deterministic so the same
--  demo dataset is produced every time (booking ids derive from show ids).
--
--  Dates are relative to CURDATE(), so the catalogue always contains screenings
--  "today" and for the next 6 days — the project is demo-ready whenever it is
--  loaded. All timestamps are handled in UTC (see docs/ARCHITECTURE.md).
-- =============================================================================

USE cineverse;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- -----------------------------------------------------------------------------
--  Reference data: genres
-- -----------------------------------------------------------------------------
INSERT INTO genres (name, slug) VALUES
  ('Action','action'), ('Adventure','adventure'), ('Animation','animation'),
  ('Comedy','comedy'), ('Drama','drama'), ('Family','family'),
  ('Fantasy','fantasy'), ('Horror','horror'), ('Mystery','mystery'),
  ('Romance','romance'), ('Sci-Fi','sci-fi'), ('Thriller','thriller');

-- -----------------------------------------------------------------------------
--  Movies. The 8 "now_showing" titles drive the show generator below.
--  Posters are project-owned SVGs (frontend/public/posters) so the demo works
--  completely offline — see README for swapping in real poster URLs.
-- -----------------------------------------------------------------------------
INSERT INTO movies
  (title, slug, synopsis, duration_minutes, language, certificate, rating, vote_count,
   director, cast_list, poster_url, backdrop_url, trailer_url, release_date, status, is_featured)
VALUES
  ('Neon Horizon', 'neon-horizon',
   'In 2091 the last free city runs on a single illegal power core. A disgraced grid engineer has 48 hours to reach the core before the corporations shut the city down — and something in the dark is already counting down with her.',
   142, 'English', 'UA', 8.6, 24810, 'Aarav Mehta', 'Ishita Rao, Daniel Okafor, Meera Nair',
   '/posters/neon-horizon.svg', '/posters/neon-horizon.svg', 'https://example.com/trailers/neon-horizon',
   DATE_SUB(CURDATE(), INTERVAL 6 DAY), 'now_showing', 1),

  ('Kalari: Rise of the Warrior', 'kalari-rise-of-the-warrior',
   'A 17th century Kalaripayattu master trains an orphaned stable girl in a forbidden martial art, unaware that her bloodline is the very reason the raiders burned her village.',
   155, 'Malayalam', 'UA', 8.8, 41220, 'Rohit Varma', 'Aditi Menon, Pranav Nambiar, Suresh Pillai',
   '/posters/kalari.svg', '/posters/kalari.svg', 'https://example.com/trailers/kalari',
   DATE_SUB(CURDATE(), INTERVAL 13 DAY), 'now_showing', 1),

  ('The Last Monsoon', 'the-last-monsoon',
   'Two hydrologists who mapped the same dying river from opposite banks meet again when the dam is finally scheduled for demolition.',
   128, 'Hindi', 'UA', 8.1, 15640, 'Nandita Bhandari', 'Kabir Sethi, Tara Iyer, Mohan Deshmukh',
   '/posters/the-last-monsoon.svg', '/posters/the-last-monsoon.svg', 'https://example.com/trailers/last-monsoon',
   DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'now_showing', 0),

  ('Pixel Pals', 'pixel-pals',
   'When a power surge traps four arcade buddies inside their own machine, they must beat every level the machine can invent — including the one game nobody has ever finished.',
   96, 'English', 'U', 7.9, 9830, 'Grace Lim', 'Voices of: Toby Shaw, Nina Alvarez, Dev Patel',
   '/posters/pixel-pals.svg', '/posters/pixel-pals.svg', 'https://example.com/trailers/pixel-pals',
   DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'now_showing', 0),

  ('Silent Frequency', 'silent-frequency',
   'A late-night radio host realises the static between her segments is a recording of what will happen in the studio at 3:00 AM.',
   118, 'English', 'A', 7.4, 7210, 'Marcus Reyes', 'Elena Fischer, Kwame Boateng, Ruth Allen',
   '/posters/silent-frequency.svg', '/posters/silent-frequency.svg', 'https://example.com/trailers/silent-frequency',
   DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'now_showing', 0),

  ('Coastal Run', 'coastal-run',
   'A retired rally driver and a runaway food-truck cook accidentally steal the same getaway car and have 400 km of coastline to figure out who gets to keep it.',
   134, 'Tamil', 'UA', 7.6, 11980, 'Vignesh Anand', 'Suriya Karthik, Divya Balan, Arjun Selvam',
   '/posters/coastal-run.svg', '/posters/coastal-run.svg', 'https://example.com/trailers/coastal-run',
   DATE_SUB(CURDATE(), INTERVAL 24 DAY), 'now_showing', 0),

  ('Zero Gravity', 'zero-gravity',
   'The first privately funded deep-space salvage crew finds a derelict station that is still very much awake, and the station has been waiting a long time for visitors.',
   149, 'English', 'UA', 8.3, 20140, 'Hana Sorensen', 'Liam Novak, Priya Raghunathan, Tomas Ek',
   '/posters/zero-gravity.svg', '/posters/zero-gravity.svg', 'https://example.com/trailers/zero-gravity',
   DATE_SUB(CURDATE(), INTERVAL 17 DAY), 'now_showing', 1),

  ('The Silk Route', 'the-silk-route',
   'A caravan mapmaker in 1450 is blackmailed into guiding three rival courts to the same legendary city on the same road, in the same season.',
   137, 'Hindi', 'UA', 8.0, 17450, 'Zoya Qureshi', 'Rehan Malik, Alka Bhatia, Yusuf Khan',
   '/posters/the-silk-route.svg', '/posters/the-silk-route.svg', 'https://example.com/trailers/the-silk-route',
   DATE_SUB(CURDATE(), INTERVAL 31 DAY), 'now_showing', 0),

  ('Echoes of Tomorrow', 'echoes-of-tomorrow',
   'A cryptographer receives thirty seconds of audio from four days ahead every time she sleeps. Saving the city means losing everyone she warns.',
   131, 'English', 'UA', 0.0, 0, 'Ira Kulkarni', 'Sana Kapoor, Vincent Cole, Ana Duarte',
   '/posters/echoes-of-tomorrow.svg', '/posters/echoes-of-tomorrow.svg', 'https://example.com/trailers/echoes-of-tomorrow',
   DATE_ADD(CURDATE(), INTERVAL 9 DAY), 'upcoming', 1),

  ('Rangoli Nights', 'rangoli-nights',
   'Three generations of a wedding-catering family fight over the same kitchen and the same recipe book for one chaotic Diwali season.',
   121, 'Hindi', 'U', 0.0, 0, 'Meghna Joshi', 'Lata Rao, Sameer Dutt, Bhavna Reddy',
   '/posters/rangoli-nights.svg', '/posters/rangoli-nights.svg', 'https://example.com/trailers/rangoli-nights',
   DATE_ADD(CURDATE(), INTERVAL 16 DAY), 'upcoming', 0),

  ('Deep Blue Silence', 'deep-blue-silence',
   'A submersible pilot hears a second heartbeat on the sonar while descending alone to repair a research rig two kilometres down.',
   113, 'English', 'A', 0.0, 0, 'Kofi Mensah', 'Hannah Bright, Nikolai Petrov, Jia Lin',
   '/posters/deep-blue-silence.svg', '/posters/deep-blue-silence.svg', 'https://example.com/trailers/deep-blue-silence',
   DATE_ADD(CURDATE(), INTERVAL 23 DAY), 'upcoming', 0),

  ('Skyforge Legends', 'skyforge-legends',
   'A young blacksmith who can hammer storms into metal must forge the last dragon saddle before the sky falls.',
   104, 'English', 'U', 0.0, 0, 'Elena Petrova', 'Voices of: Marley Chen, Owen Frost, Aisha Bello',
   '/posters/skyforge-legends.svg', '/posters/skyforge-legends.svg', 'https://example.com/trailers/skyforge-legends',
   DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'upcoming', 0);

-- -----------------------------------------------------------------------------
--  Movie <-> genre assignments (many-to-many)
-- -----------------------------------------------------------------------------
INSERT INTO movie_genres (movie_id, genre_id)
SELECT m.id, g.id
FROM (
            SELECT 'neon-horizon' AS movie_slug, 'sci-fi' AS genre_slug
  UNION ALL SELECT 'neon-horizon', 'action'
  UNION ALL SELECT 'neon-horizon', 'thriller'
  UNION ALL SELECT 'kalari-rise-of-the-warrior', 'action'
  UNION ALL SELECT 'kalari-rise-of-the-warrior', 'drama'
  UNION ALL SELECT 'the-last-monsoon', 'drama'
  UNION ALL SELECT 'the-last-monsoon', 'romance'
  UNION ALL SELECT 'pixel-pals', 'animation'
  UNION ALL SELECT 'pixel-pals', 'family'
  UNION ALL SELECT 'pixel-pals', 'comedy'
  UNION ALL SELECT 'silent-frequency', 'horror'
  UNION ALL SELECT 'silent-frequency', 'thriller'
  UNION ALL SELECT 'silent-frequency', 'mystery'
  UNION ALL SELECT 'coastal-run', 'comedy'
  UNION ALL SELECT 'coastal-run', 'action'
  UNION ALL SELECT 'zero-gravity', 'sci-fi'
  UNION ALL SELECT 'zero-gravity', 'adventure'
  UNION ALL SELECT 'zero-gravity', 'thriller'
  UNION ALL SELECT 'the-silk-route', 'adventure'
  UNION ALL SELECT 'the-silk-route', 'drama'
  UNION ALL SELECT 'the-silk-route', 'fantasy'
  UNION ALL SELECT 'echoes-of-tomorrow', 'sci-fi'
  UNION ALL SELECT 'echoes-of-tomorrow', 'mystery'
  UNION ALL SELECT 'echoes-of-tomorrow', 'thriller'
  UNION ALL SELECT 'rangoli-nights', 'romance'
  UNION ALL SELECT 'rangoli-nights', 'drama'
  UNION ALL SELECT 'rangoli-nights', 'comedy'
  UNION ALL SELECT 'deep-blue-silence', 'thriller'
  UNION ALL SELECT 'deep-blue-silence', 'mystery'
  UNION ALL SELECT 'deep-blue-silence', 'drama'
  UNION ALL SELECT 'skyforge-legends', 'fantasy'
  UNION ALL SELECT 'skyforge-legends', 'adventure'
  UNION ALL SELECT 'skyforge-legends', 'animation'
) AS pairs
JOIN movies m ON m.slug = pairs.movie_slug
JOIN genres g ON g.slug = pairs.genre_slug;

-- -----------------------------------------------------------------------------
--  Theatres (3 cities)
-- -----------------------------------------------------------------------------
INSERT INTO theatres (name, city, address, phone, amenities, rating) VALUES
  ('PVR Nexus Grand', 'Hyderabad', 'Road No. 12, Banjara Hills, Hyderabad 500034', '+91 40 4012 8800',
   'Recliner seating, Dolby Atmos, Valet parking, Food court, Wheelchair access', 4.6),
  ('AMB Cinemas Lux', 'Hyderabad', 'Gachibowli Flyover, Financial District, Hyderabad 500032', '+91 40 4455 1200',
   'Laser IMAX, Recliner seating, Gourmet kitchen, Valet parking', 4.8),
  ('INOX Velvet Mall', 'Hyderabad', '4th Floor, Velvet Mall, Kukatpally, Hyderabad 500072', '+91 40 3399 7700',
   '4DX, Dolby Atmos, Arcade, Food court, Parking', 4.3),
  ('Cinepolis Orion Square', 'Bengaluru', 'Orion Square, Whitefield Main Road, Bengaluru 560066', '+91 80 6712 4400',
   'IMAX, Recliner seating, Café bar, Wheelchair access', 4.5),
  ('Sri Sai Cinemas 4K', 'Vijayawada', 'MG Road, Gandhi Nagar, Vijayawada 520003', '+91 866 245 9090',
   'Single screen, 4K laser projection, Dolby 7.1, Free parking', 4.1);

-- -----------------------------------------------------------------------------
--  Screens. Layout is described by total_rows / seats_per_row; the seat grid is
--  materialised from these two numbers further down.
-- -----------------------------------------------------------------------------
INSERT INTO screens (theatre_id, name, screen_type, total_rows, seats_per_row)
SELECT t.id, s.screen_name, s.screen_type, s.total_rows, s.seats_per_row
FROM (
            SELECT 'PVR Nexus Grand' AS theatre_name, 'Audi 1'      AS screen_name, 'DOLBY_ATMOS' AS screen_type, 10 AS total_rows, 16 AS seats_per_row
  UNION ALL SELECT 'PVR Nexus Grand',           'Audi 2',                 '2D',           9,  14
  UNION ALL SELECT 'PVR Nexus Grand',           'Audi 3',                 '3D',           9,  14
  UNION ALL SELECT 'AMB Cinemas Lux',           'IMAX Screen',            'IMAX',        12,  20
  UNION ALL SELECT 'AMB Cinemas Lux',           'Lux 1',                  'DOLBY_ATMOS', 10,  16
  UNION ALL SELECT 'AMB Cinemas Lux',           'Lux 2',                  '3D',           8,  14
  UNION ALL SELECT 'INOX Velvet Mall',          '4DX Arena',              '4DX',          8,  12
  UNION ALL SELECT 'INOX Velvet Mall',          'Screen 1',               '2D',          10,  14
  UNION ALL SELECT 'INOX Velvet Mall',          'Screen 2',               '3D',           9,  12
  UNION ALL SELECT 'Cinepolis Orion Square',    'IMAX 1',                 'IMAX',        11,  18
  UNION ALL SELECT 'Cinepolis Orion Square',    'Screen 2',               'DOLBY_ATMOS', 10,  16
  UNION ALL SELECT 'Cinepolis Orion Square',    'Screen 3',               '2D',           9,  14
  UNION ALL SELECT 'Sri Sai Cinemas 4K',        'Main Screen',            '2D',          14,  22
  UNION ALL SELECT 'Sri Sai Cinemas 4K',        'Balcony',                '2D',           6,  18
) AS s
JOIN theatres t ON t.name = s.theatre_name;

-- -----------------------------------------------------------------------------
--  Seat categories: three pricing tiers per screen, priced off the screen type
--  with a tier multiplier (base prices are rounded to the nearest 10).
-- -----------------------------------------------------------------------------
INSERT INTO seat_categories (screen_id, code, label, base_price, color_hex)
SELECT
  sc.id,
  tier.code,
  tier.label,
  ROUND(price.base_price * tier.multiplier / 10) * 10 AS base_price,
  tier.color_hex
FROM screens sc
JOIN (
            SELECT '2D'          AS screen_type, 150 AS base_price
  UNION ALL SELECT '3D',                        180
  UNION ALL SELECT 'IMAX',                      240
  UNION ALL SELECT '4DX',                       270
  UNION ALL SELECT 'DOLBY_ATMOS',               210
) AS price ON price.screen_type = sc.screen_type
JOIN (
            SELECT 'CLASSIC'  AS code, 'Classic'  AS label, 1.00 AS multiplier, '#5b8def' AS color_hex
  UNION ALL SELECT 'PREMIUM',        'Premium',        1.45,               '#a855f7'
  UNION ALL SELECT 'RECLINER',       'Recliner',       1.90,               '#f5a524'
) AS tier;

-- -----------------------------------------------------------------------------
--  Row blueprint: front third is Classic, the last two rows are Recliner,
--  everything in between is Premium. Row labels A..Z are generated from the
--  screen's total_rows using a recursive CTE.
-- -----------------------------------------------------------------------------
INSERT INTO screen_rows (screen_id, row_label, seat_count, category_id)
WITH RECURSIVE row_numbers AS (
  SELECT 1 AS r
  UNION ALL
  SELECT r + 1 FROM row_numbers WHERE r < 26
)
SELECT
  sc.id,
  CAST(CHAR(64 + rn.r) AS CHAR(2)) AS row_label,
  sc.seats_per_row,
  cat.id
FROM screens sc
JOIN row_numbers rn ON rn.r <= sc.total_rows
JOIN seat_categories cat
  ON cat.screen_id = sc.id
 AND cat.code = CASE
       WHEN rn.r <= CEIL(sc.total_rows * 0.35) THEN 'CLASSIC'
       WHEN rn.r <= sc.total_rows - 2          THEN 'PREMIUM'
       ELSE 'RECLINER'
     END;

-- -----------------------------------------------------------------------------
--  Seats: materialised from the row blueprint. Numbers are left-padded on the
--  client (row A, seat 4 -> "A04").
-- -----------------------------------------------------------------------------
INSERT INTO seats (screen_id, row_label, seat_number, category_id)
WITH RECURSIVE seat_numbers AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seat_numbers WHERE n < 40
)
SELECT sr.screen_id, sr.row_label, sn.n, sr.category_id
FROM screen_rows sr
JOIN seat_numbers sn ON sn.n <= sr.seat_count;

-- Some seats are out of service to prove `is_active` is honoured by the API.
UPDATE seats SET is_active = 0
WHERE seat_number = 1
  AND row_label IN ('A', 'B')
  AND screen_id IN (SELECT id FROM (SELECT id FROM screens ORDER BY id LIMIT 4) AS first_four);

-- -----------------------------------------------------------------------------
--  Shows: 5 slots a day for the next 7 days on every screen, cycling through
--  the now-showing movies. Price multiplier models demand pricing.
-- -----------------------------------------------------------------------------
-- Starts two days in the past so the catalogue also contains finished
-- screenings (status -> 'completed' below). That keeps the admin reports and
-- the "completed" branch of the API populated instead of empty.
INSERT INTO shows (movie_id, screen_id, show_date, start_time, end_time, language, price_multiplier, status)
WITH RECURSIVE day_offsets AS (
  SELECT -2 AS d
  UNION ALL
  SELECT d + 1 FROM day_offsets WHERE d < 6
),
slot_list AS (
            SELECT 1 AS slot_index, CAST('10:45:00' AS TIME) AS start_time
  UNION ALL SELECT 2, CAST('13:30:00' AS TIME)
  UNION ALL SELECT 3, CAST('16:45:00' AS TIME)
  UNION ALL SELECT 4, CAST('19:30:00' AS TIME)
  UNION ALL SELECT 5, CAST('22:15:00' AS TIME)
),
screen_list AS (
  SELECT sc.id, ROW_NUMBER() OVER (ORDER BY sc.id) - 1 AS rn, COUNT(*) OVER () AS total
  FROM screens sc
  WHERE sc.is_active = 1
),
movie_list AS (
  SELECT m.id, m.duration_minutes, m.language,
         ROW_NUMBER() OVER (ORDER BY m.id) - 1 AS rn,
         COUNT(*) OVER () AS total
  FROM movies m
  WHERE m.status = 'now_showing'
)
SELECT
  mv.id,
  sl.id,
  DATE_ADD(CURDATE(), INTERVAL do.d DAY) AS show_date,
  slot.start_time,
  ADDTIME(slot.start_time, SEC_TO_TIME(mv.duration_minutes * 60)) AS end_time,
  mv.language,
  CASE
    WHEN DAYOFWEEK(DATE_ADD(CURDATE(), INTERVAL do.d DAY)) IN (1, 7)
         AND slot.start_time >= '18:00:00' THEN 1.40
    WHEN DAYOFWEEK(DATE_ADD(CURDATE(), INTERVAL do.d DAY)) IN (1, 7) THEN 1.25
    WHEN slot.start_time >= '18:00:00' THEN 1.20
    ELSE 1.00
  END AS price_multiplier,
  'scheduled'
FROM day_offsets do
CROSS JOIN slot_list slot
JOIN screen_list sl ON TRUE
JOIN movie_list mv
  -- CAST(... AS SIGNED) + `mv.total * 10` are both required: do.d can be
  -- negative (past days) and MySQL would otherwise promote the whole expression
  -- to UNSIGNED and overflow.
  ON mv.rn = MOD(CAST(sl.rn AS SIGNED) + slot.slot_index + do.d + mv.total * 10, mv.total);

-- Screenings that have already finished are marked completed so they disappear
-- from the booking flow (and, via a trigger, can no longer receive seats).
UPDATE shows
   SET status = 'completed'
 WHERE show_date < CURDATE()
    OR (show_date = CURDATE() AND end_time <= CURTIME());

-- -----------------------------------------------------------------------------
--  Users — the project team plus a demo account.
--  Passwords: admin123 (admin) / password123 (everyone else).
--  Hashes are bcrypt (bcryptjs, 10 rounds).
-- -----------------------------------------------------------------------------
INSERT INTO users (full_name, email, phone, password_hash, role) VALUES
  ('Nihas',    'nihas@cineverse.dev',    '+91 98490 11001', '$2a$10$QPCSOIqcIIrSTrqrnJSyku45WZNw3lxWo0pU04qodHektA/8Q5x4y', 'admin'),
  ('Srikanth', 'srikanth@cineverse.dev', '+91 98490 11002', '$2a$10$ljgxowB551ui7JCqd919ae47gnwVjKRFsVzpUwFL4nu6AQux6s5SK', 'customer'),
  ('Vaibhav',  'vaibhav@cineverse.dev',  '+91 98490 11003', '$2a$10$ljgxowB551ui7JCqd919ae47gnwVjKRFsVzpUwFL4nu6AQux6s5SK', 'customer'),
  ('Varun',    'varun@cineverse.dev',    '+91 98490 11004', '$2a$10$ljgxowB551ui7JCqd919ae47gnwVjKrFsVzpUwFL4nu6AQux6s5SK', 'customer'),
  ('Ranjith',  'ranjith@cineverse.dev',  '+91 98490 11005', '$2a$10$ljgxowB551ui7JCqd919ae47gnwVjKRFsVzpUwFL4nu6AQux6s5SK', 'customer'),
  ('Demo Customer', 'demo@cineverse.dev', '+91 98490 11006', '$2a$10$ljgxowB551ui7JCqd919ae47gnwVjKRFsVzpUwFL4nu6AQux6s5SK', 'customer');

-- -----------------------------------------------------------------------------
--  Sample bookings so the seat maps, admin dashboard and reports are not empty.
--  They are inserted as PENDING because a trigger forbids editing the amounts of
--  a CONFIRMED booking; totals are computed from the seat lines and only then is
--  the booking promoted to CONFIRMED.
-- -----------------------------------------------------------------------------
INSERT INTO bookings
  (booking_reference, user_id, show_id, status, seat_count, subtotal, convenience_fee,
   total_amount, customer_name, customer_email, customer_phone, expires_at)
SELECT
  CONCAT('CV-', UPPER(LEFT(MD5(CONCAT('cineverse-booking-', sh.id)), 8))),
  cust.id,
  sh.id,
  'PENDING',
  1, 0.00, 0.00, 0.00,
  cust.full_name,
  cust.email,
  cust.phone,
  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
FROM shows sh
JOIN (
  SELECT id, full_name, email, phone,
         ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn,
         COUNT(*) OVER () AS total
  FROM users
  WHERE role = 'customer'
) AS cust ON cust.rn = (sh.id - 1) MOD cust.total
WHERE sh.status = 'scheduled'
  AND sh.show_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 6 DAY)
  AND (sh.show_date > CURDATE() OR sh.start_time > CURTIME())
ORDER BY sh.show_date, sh.start_time, sh.id
LIMIT 24;

-- Seat lines are picked with a window function: for every booking we rank all
-- seats of its screen by a booking-dependent pseudo-random key and keep the
-- first 2-4. Deterministic (same result on every seed) but not always A01/A02,
-- and two bookings on the same show never collide.
INSERT INTO booking_seats (booking_id, show_id, seat_id, category_code, unit_price, status)
SELECT
  ranked.booking_id,
  ranked.show_id,
  ranked.seat_id,
  cat.code,
  ROUND(cat.base_price * ranked.price_multiplier, 2),
  'CONFIRMED'
FROM (
  SELECT
    b.id AS booking_id,
    b.show_id,
    s.id AS seat_id,
    s.category_id,
    sh.price_multiplier,
    MOD(b.id, 3) AS extra_seats,
    ROW_NUMBER() OVER (
      PARTITION BY b.id
      ORDER BY MOD(s.id * 7919 + b.id * 104729, 100003)
    ) AS seat_rank
  FROM bookings b
  JOIN shows   sh ON sh.id = b.show_id
  JOIN screens sc ON sc.id = sh.screen_id
  JOIN seats   s  ON s.screen_id = sc.id AND s.is_active = 1
  WHERE b.status = 'PENDING'
) AS ranked
JOIN seat_categories cat ON cat.id = ranked.category_id
WHERE ranked.seat_rank <= 2 + ranked.extra_seats;

-- Recompute money from the seat lines (still PENDING, so the trigger allows it).
UPDATE bookings b
JOIN (
  SELECT booking_id, COUNT(*) AS seat_count, SUM(unit_price) AS subtotal
  FROM booking_seats
  WHERE status = 'CONFIRMED'
  GROUP BY booking_id
) AS totals ON totals.booking_id = b.id
SET b.seat_count       = totals.seat_count,
    b.subtotal         = totals.subtotal,
    b.convenience_fee  = ROUND(totals.subtotal * 0.05, 2),
    b.total_amount     = totals.subtotal + ROUND(totals.subtotal * 0.05, 2),
    b.expires_at       = NULL
WHERE b.status = 'PENDING';

UPDATE bookings
   SET status = 'CONFIRMED', confirmed_at = UTC_TIMESTAMP()
 WHERE status = 'PENDING';

INSERT INTO payments (booking_id, payment_reference, amount, method, status, gateway_message, paid_at)
SELECT
  b.id,
  CONCAT('PAY-', UPPER(LEFT(MD5(CONCAT('cineverse-payment-', b.id)), 12))),
  b.total_amount,
  ELT(1 + (b.id MOD 4), 'CARD', 'UPI', 'NETBANKING', 'WALLET'),
  'SUCCESS',
  'Demo gateway: payment captured successfully',
  b.confirmed_at
FROM bookings b
WHERE b.status = 'CONFIRMED';

-- -----------------------------------------------------------------------------
--  Two cancelled bookings. Their seat lines are marked CANCELLED, which makes
--  the generated `active_seat_key` NULL and therefore frees the seats again —
--  a live demonstration of how the unique guard behaves.
-- -----------------------------------------------------------------------------
INSERT INTO bookings
  (booking_reference, user_id, show_id, status, seat_count, subtotal, convenience_fee,
   total_amount, customer_name, customer_email, customer_phone, cancelled_at)
SELECT
  CONCAT('CV-CXL', UPPER(LEFT(MD5(CONCAT('cineverse-cancelled-', sh.id)), 5))),
  (SELECT id FROM users WHERE role = 'customer' ORDER BY id LIMIT 1),
  sh.id,
  'PENDING',
  1, 0.00, 0.00, 0.00,
  'Cancelled Demo', 'cancelled.demo@cineverse.dev', '+91 90000 00000',
  UTC_TIMESTAMP()
FROM shows sh
WHERE sh.status = 'scheduled'
  AND sh.show_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
ORDER BY sh.id
LIMIT 2;

INSERT INTO booking_seats (booking_id, show_id, seat_id, category_code, unit_price, status)
SELECT
  picked.booking_id, picked.show_id, picked.seat_id, cat.code,
  ROUND(cat.base_price * picked.price_multiplier, 2), 'CANCELLED'
FROM (
  SELECT
    b.id AS booking_id,
    b.show_id,
    s.id AS seat_id,
    s.category_id,
    sh.price_multiplier,
    ROW_NUMBER() OVER (PARTITION BY b.id ORDER BY s.row_label, s.seat_number) AS seat_rank
  FROM bookings b
  JOIN shows   sh ON sh.id = b.show_id
  JOIN screens sc ON sc.id = sh.screen_id
  JOIN seats   s  ON s.screen_id = sc.id AND s.is_active = 1
  WHERE b.status = 'PENDING'
    AND b.booking_reference LIKE 'CV-CXL%'
) AS picked
JOIN seat_categories cat ON cat.id = picked.category_id
WHERE picked.seat_rank <= 2;

UPDATE bookings b
JOIN (
  SELECT booking_id, COUNT(*) AS seat_count, SUM(unit_price) AS subtotal
  FROM booking_seats WHERE status = 'CANCELLED' GROUP BY booking_id
) AS totals ON totals.booking_id = b.id
SET b.seat_count      = totals.seat_count,
    b.subtotal        = totals.subtotal,
    b.convenience_fee = ROUND(totals.subtotal * 0.05, 2),
    b.total_amount    = totals.subtotal + ROUND(totals.subtotal * 0.05, 2)
WHERE b.status = 'PENDING';

UPDATE bookings
   SET status = 'CANCELLED'
 WHERE status = 'PENDING';

-- -----------------------------------------------------------------------------
--  Seed summary — printed so `npm run db:reset` visibly reports what was loaded.
-- -----------------------------------------------------------------------------
SELECT 'users'          AS entity, COUNT(*) AS rows_loaded FROM users
UNION ALL SELECT 'movies',        COUNT(*) FROM movies
UNION ALL SELECT 'genres',        COUNT(*) FROM genres
UNION ALL SELECT 'movie_genres',  COUNT(*) FROM movie_genres
UNION ALL SELECT 'theatres',      COUNT(*) FROM theatres
UNION ALL SELECT 'screens',       COUNT(*) FROM screens
UNION ALL SELECT 'seat_categories', COUNT(*) FROM seat_categories
UNION ALL SELECT 'screen_rows',   COUNT(*) FROM screen_rows
UNION ALL SELECT 'seats',         COUNT(*) FROM seats
UNION ALL SELECT 'shows',         COUNT(*) FROM shows
UNION ALL SELECT 'bookings',      COUNT(*) FROM bookings
UNION ALL SELECT 'booking_seats', COUNT(*) FROM booking_seats
UNION ALL SELECT 'payments',      COUNT(*) FROM payments;
