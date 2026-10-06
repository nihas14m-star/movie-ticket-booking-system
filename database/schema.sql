-- =============================================================================
--  CINEVERSE — Movie Ticket Booking System
--  database/schema.sql
-- -----------------------------------------------------------------------------
--  MySQL 8.0+ relational schema.
--
--  This file is IDEMPOTENT: it drops and recreates the `cineverse` database,
--  so it is always safe to re-run while developing.
--
--  Load it with any of:
--     mysql -u root -p < database/schema.sql
--     MySQL Workbench  ->  File > Open SQL Script  ->  run
--     npm run db:reset          (uses backend/src/db/migrate.js)
--
--  Design notes are inline. See docs/ARCHITECTURE.md for the full rationale and
--  docs/ER_DIAGRAM.md for the entity-relationship diagram.
-- =============================================================================

DROP DATABASE IF EXISTS cineverse;
CREATE DATABASE cineverse
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE cineverse;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =============================================================================
--  1. users
-- -----------------------------------------------------------------------------
--  One row per person who can sign in. Customers are created automatically on
--  first booking (password_hash stays NULL for guests). Admins must have a
--  password and are the only role allowed to write catalogue data.
-- =============================================================================
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NULL COMMENT 'bcrypt hash; NULL for guest customers',
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%')
) ENGINE = InnoDB COMMENT = 'Customers and administrators';

-- =============================================================================
--  2. genres  +  3. movie_genres
-- -----------------------------------------------------------------------------
--  Many-to-many: a movie has several genres and a genre has several movies.
--  Kept in its own table instead of a comma separated column (1NF).
-- =============================================================================
CREATE TABLE genres (
  id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(40) NOT NULL,
  slug VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_genres_name (name),
  UNIQUE KEY uq_genres_slug (slug)
) ENGINE = InnoDB COMMENT = 'Genre lookup table';

-- =============================================================================
--  4. movies
-- =============================================================================
CREATE TABLE movies (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title            VARCHAR(160) NOT NULL,
  slug             VARCHAR(180) NOT NULL COMMENT 'URL friendly identifier',
  synopsis         TEXT NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  language         VARCHAR(40) NOT NULL,
  certificate      ENUM('U','UA','A') NOT NULL DEFAULT 'UA',
  rating           DECIMAL(3,1) NOT NULL DEFAULT 0.0 COMMENT '0.0 - 10.0',
  vote_count       INT UNSIGNED NOT NULL DEFAULT 0,
  director         VARCHAR(120) NULL,
  cast_list        VARCHAR(400) NULL COMMENT 'Lead cast, comma separated',
  poster_url       VARCHAR(300) NOT NULL,
  backdrop_url     VARCHAR(300) NULL,
  trailer_url      VARCHAR(300) NULL,
  release_date     DATE NOT NULL,
  status           ENUM('now_showing','upcoming','archived') NOT NULL DEFAULT 'now_showing',
  is_featured      TINYINT(1) NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_movies_slug (slug),
  KEY idx_movies_status (status),
  KEY idx_movies_release (release_date),
  -- Enables natural-language / keyword search straight from the database.
  FULLTEXT KEY ft_movies_search (title, synopsis, director, cast_list),
  CONSTRAINT chk_movies_duration CHECK (duration_minutes BETWEEN 30 AND 360),
  CONSTRAINT chk_movies_rating   CHECK (rating BETWEEN 0 AND 10)
) ENGINE = InnoDB COMMENT = 'Movie catalogue';

CREATE TABLE movie_genres (
  movie_id INT UNSIGNED NOT NULL,
  genre_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  KEY idx_movie_genres_genre (genre_id),
  CONSTRAINT fk_movie_genres_movie FOREIGN KEY (movie_id)
    REFERENCES movies (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_movie_genres_genre FOREIGN KEY (genre_id)
    REFERENCES genres (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB COMMENT = 'Movie <-> Genre junction table';

-- =============================================================================
--  5. theatres
-- =============================================================================
CREATE TABLE theatres (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  city       VARCHAR(80)  NOT NULL,
  address    VARCHAR(255) NOT NULL,
  phone      VARCHAR(20)  NULL,
  amenities  VARCHAR(400) NULL COMMENT 'Comma separated amenity list',
  rating     DECIMAL(2,1) NOT NULL DEFAULT 4.0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_theatres_name_city (name, city),
  KEY idx_theatres_city (city),
  CONSTRAINT chk_theatres_rating CHECK (rating BETWEEN 0 AND 5)
) ENGINE = InnoDB COMMENT = 'Multiplexes / cinema halls';

-- =============================================================================
--  6. screens
-- -----------------------------------------------------------------------------
--  A theatre owns many screens (auditoriums). The physical seat grid is
--  described by screen_rows (which row holds how many seats and at what price)
--  and materialised into the seats table.
-- =============================================================================
CREATE TABLE screens (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  theatre_id    INT UNSIGNED NOT NULL,
  name          VARCHAR(60) NOT NULL COMMENT 'e.g. Audi 1 / IMAX Screen',
  screen_type   ENUM('2D','3D','IMAX','4DX','DOLBY_ATMOS') NOT NULL DEFAULT '2D',
  total_rows    TINYINT UNSIGNED NOT NULL,
  seats_per_row TINYINT UNSIGNED NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_screens_theatre_name (theatre_id, name),
  KEY idx_screens_theatre (theatre_id),
  CONSTRAINT fk_screens_theatre FOREIGN KEY (theatre_id)
    REFERENCES theatres (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_screens_rows CHECK (total_rows BETWEEN 1 AND 26),
  CONSTRAINT chk_screens_cols CHECK (seats_per_row BETWEEN 1 AND 40)
) ENGINE = InnoDB COMMENT = 'Auditoriums inside a theatre';

-- =============================================================================
--  7. seat_categories
-- -----------------------------------------------------------------------------
--  Pricing tiers are per screen (a recliner row in IMAX costs more than one in
--  a standard audi), which is why the price lives here and not on the seat.
-- =============================================================================
CREATE TABLE seat_categories (
  id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  screen_id  INT UNSIGNED NOT NULL,
  code       ENUM('CLASSIC','PREMIUM','RECLINER') NOT NULL,
  label      VARCHAR(40) NOT NULL,
  base_price DECIMAL(8,2) NOT NULL,
  color_hex  CHAR(7) NOT NULL DEFAULT '#7c8db5' COMMENT 'Legend colour in the seat map',
  PRIMARY KEY (id),
  UNIQUE KEY uq_seat_categories_screen_code (screen_id, code),
  CONSTRAINT fk_seat_categories_screen FOREIGN KEY (screen_id)
    REFERENCES screens (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_seat_categories_price CHECK (base_price > 0)
) ENGINE = InnoDB COMMENT = 'Pricing tier per screen';

-- =============================================================================
--  8. screen_rows
-- -----------------------------------------------------------------------------
--  The layout definition of a single row: how many physical seats it holds and
--  which pricing tier applies. This is the "blueprint" the seat generator and
--  the admin seat-layout editor work from.
-- =============================================================================
CREATE TABLE screen_rows (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  screen_id   INT UNSIGNED NOT NULL,
  row_label   CHAR(2) NOT NULL COMMENT 'A, B, C ... Z',
  seat_count  TINYINT UNSIGNED NOT NULL,
  category_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_screen_rows_label (screen_id, row_label),
  CONSTRAINT fk_screen_rows_screen FOREIGN KEY (screen_id)
    REFERENCES screens (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_screen_rows_category FOREIGN KEY (category_id)
    REFERENCES seat_categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_screen_rows_count CHECK (seat_count BETWEEN 1 AND 40)
) ENGINE = InnoDB COMMENT = 'Row blueprint of a screen';

-- =============================================================================
--  9. seats
-- -----------------------------------------------------------------------------
--  Every physically bookable seat. A seat only exists once, but it can appear
--  in many shows (one booking per show).
-- =============================================================================
CREATE TABLE seats (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  screen_id   INT UNSIGNED NOT NULL,
  row_label   CHAR(2) NOT NULL,
  seat_number TINYINT UNSIGNED NOT NULL,
  category_id SMALLINT UNSIGNED NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = broken / blocked seat',
  PRIMARY KEY (id),
  UNIQUE KEY uq_seats_position (screen_id, row_label, seat_number),
  KEY idx_seats_screen_category (screen_id, category_id),
  CONSTRAINT fk_seats_screen FOREIGN KEY (screen_id)
    REFERENCES screens (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_seats_category FOREIGN KEY (category_id)
    REFERENCES seat_categories (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB COMMENT = 'Physical seat inventory';

-- =============================================================================
-- 10. shows
-- -----------------------------------------------------------------------------
--  A scheduled screening: one movie, one screen, one date and start time.
--  price_multiplier implements demand pricing — an evening or weekend show is
--  charged at a multiple of the seat category base price.
-- =============================================================================
CREATE TABLE shows (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  movie_id         INT UNSIGNED NOT NULL,
  screen_id        INT UNSIGNED NOT NULL,
  show_date        DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  language         VARCHAR(40) NOT NULL,
  price_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  status           ENUM('scheduled','cancelled','completed') NOT NULL DEFAULT 'scheduled',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One screen cannot start two screenings at the same moment.
  UNIQUE KEY uq_shows_screen_slot (screen_id, show_date, start_time),
  KEY idx_shows_movie_date (movie_id, show_date),
  KEY idx_shows_date (show_date),
  KEY idx_shows_screen_date (screen_id, show_date, start_time),
  CONSTRAINT fk_shows_movie FOREIGN KEY (movie_id)
    REFERENCES movies (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_shows_screen FOREIGN KEY (screen_id)
    REFERENCES screens (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_shows_times CHECK (end_time > start_time),
  CONSTRAINT chk_shows_multiplier CHECK (price_multiplier BETWEEN 1.00 AND 3.00)
) ENGINE = InnoDB COMMENT = 'Scheduled screenings';

-- =============================================================================
-- 11. bookings
-- -----------------------------------------------------------------------------
--  A booking is created as PENDING with a short hold (expires_at). Paying
--  flips it to CONFIRMED; abandoning it lets the hold expire and the seats are
--  released automatically by sp_release_expired_holds().
--
--  customer_* columns are a deliberate snapshot: a ticket must keep showing the
--  details it was issued with even if the user later edits their profile.
-- =============================================================================
CREATE TABLE bookings (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_reference VARCHAR(24) NOT NULL COMMENT 'Human friendly ticket id, e.g. CV-8F3K9Q2A',
  user_id          INT UNSIGNED NOT NULL,
  show_id          INT UNSIGNED NOT NULL,
  status           ENUM('PENDING','CONFIRMED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  seat_count       TINYINT UNSIGNED NOT NULL,
  subtotal         DECIMAL(10,2) NOT NULL COMMENT 'Sum of seat prices',
  convenience_fee  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount     DECIMAL(10,2) NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'INR',
  customer_name    VARCHAR(120) NOT NULL,
  customer_email   VARCHAR(190) NOT NULL,
  customer_phone   VARCHAR(20)  NOT NULL,
  expires_at       DATETIME NULL COMMENT 'Seat hold deadline for PENDING bookings',
  confirmed_at     DATETIME NULL,
  cancelled_at     DATETIME NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_reference (booking_reference),
  KEY idx_bookings_user (user_id),
  KEY idx_bookings_show (show_id),
  KEY idx_bookings_status_expiry (status, expires_at),
  KEY idx_bookings_email (customer_email),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_bookings_show FOREIGN KEY (show_id)
    REFERENCES shows (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_bookings_amounts CHECK (total_amount = subtotal + convenience_fee),
  CONSTRAINT chk_bookings_seats CHECK (seat_count >= 1)
) ENGINE = InnoDB COMMENT = 'Booking header';

-- =============================================================================
-- 12. booking_seats  —  the double-booking guard
-- -----------------------------------------------------------------------------
--  `active_seat_key` is a STORED generated column that is 1 while the seat is
--  held or sold and NULL once the line is CANCELLED / EXPIRED.
--
--  MySQL unique indexes treat NULLs as distinct, so:
--      UNIQUE (show_id, seat_id, active_seat_key)
--  allows any number of cancelled rows for a seat but exactly ONE live row.
--  Two concurrent requests for the same seat therefore collide and the second
--  one gets a duplicate-key error -> the racing transaction is rolled back.
--  This is enforced by the database, not only by application code.
-- =============================================================================
CREATE TABLE booking_seats (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id  INT UNSIGNED NOT NULL,
  show_id     INT UNSIGNED NOT NULL COMMENT 'Denormalised on purpose: the unique guard needs it',
  seat_id     INT UNSIGNED NOT NULL,
  category_code ENUM('CLASSIC','PREMIUM','RECLINER') NOT NULL,
  unit_price  DECIMAL(8,2) NOT NULL COMMENT 'category base price x show multiplier',
  status      ENUM('CONFIRMED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'CONFIRMED',
  active_seat_key TINYINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN status IN ('CANCELLED','EXPIRED') THEN NULL ELSE 1 END) STORED,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_seats_show_seat (show_id, seat_id, active_seat_key),
  KEY idx_booking_seats_booking (booking_id),
  KEY idx_booking_seats_show (show_id),
  CONSTRAINT fk_booking_seats_booking FOREIGN KEY (booking_id)
    REFERENCES bookings (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_booking_seats_show FOREIGN KEY (show_id)
    REFERENCES shows (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_booking_seats_seat FOREIGN KEY (seat_id)
    REFERENCES seats (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB COMMENT = 'One row per seat per booking (double-booking guard)';

-- =============================================================================
-- 13. payments
-- -----------------------------------------------------------------------------
--  Exactly one payment attempt row per booking. `method` and `status` are
--  enumerated so reporting can group on them.
-- =============================================================================
CREATE TABLE payments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id        INT UNSIGNED NOT NULL,
  payment_reference VARCHAR(40) NOT NULL,
  amount            DECIMAL(10,2) NOT NULL,
  method            ENUM('CARD','UPI','NETBANKING','WALLET') NOT NULL,
  status            ENUM('INITIATED','SUCCESS','FAILED','REFUNDED') NOT NULL DEFAULT 'INITIATED',
  gateway_message   VARCHAR(255) NULL,
  paid_at           DATETIME NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_booking (booking_id),
  UNIQUE KEY uq_payments_reference (payment_reference),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id)
    REFERENCES bookings (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE = InnoDB COMMENT = 'Payment records';

-- =============================================================================
--  TRIGGERS
-- =============================================================================
DELIMITER //

-- Seats can never be attached to a screening that is not on sale.
CREATE TRIGGER trg_booking_seats_show_must_be_scheduled
BEFORE INSERT ON booking_seats
FOR EACH ROW
BEGIN
  DECLARE v_show_status VARCHAR(20);
  SELECT status INTO v_show_status FROM shows WHERE id = NEW.show_id;
  IF v_show_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown show';
  END IF;
  IF v_show_status <> 'scheduled' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot reserve seats: this show is cancelled or already completed';
  END IF;
END//

-- Money on a booking may never be edited once the booking is confirmed.
CREATE TRIGGER trg_bookings_amounts_immutable
BEFORE UPDATE ON bookings
FOR EACH ROW
BEGIN
  IF OLD.status = 'CONFIRMED'
     AND (NEW.subtotal <> OLD.subtotal OR NEW.total_amount <> OLD.total_amount) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Amounts of a confirmed booking are immutable';
  END IF;
END//

DELIMITER ;

-- =============================================================================
--  STORED PROCEDURE — release abandoned seat holds
-- -----------------------------------------------------------------------------
--  Any PENDING booking past its expires_at is expired and its seat rows are
--  released (status -> EXPIRED, which nulls active_seat_key).
--  Called by the API before every seat map / booking attempt and by a timer.
-- =============================================================================
DELIMITER //
CREATE PROCEDURE sp_release_expired_holds()
BEGIN
  DECLARE v_expired INT DEFAULT 0;

  -- A seat line expires when its PENDING booking is past the hold deadline.
  UPDATE booking_seats bs
     JOIN bookings b ON b.id = bs.booking_id
     SET bs.status = 'EXPIRED'
   WHERE b.status = 'PENDING'
     AND b.expires_at IS NOT NULL
     AND b.expires_at < UTC_TIMESTAMP()
     AND bs.status = 'CONFIRMED';

  SELECT ROW_COUNT() INTO v_expired;

  UPDATE bookings
     SET status = 'EXPIRED'
   WHERE status = 'PENDING'
     AND expires_at IS NOT NULL
     AND expires_at < UTC_TIMESTAMP();

  SELECT v_expired AS released_seat_lines;
END//
DELIMITER ;

-- =============================================================================
--  VIEWS
-- =============================================================================

-- Live occupancy per screening — used by the admin dashboard and reporting.
CREATE VIEW vw_show_occupancy AS
SELECT
  sh.id                                        AS show_id,
  m.title                                      AS movie_title,
  t.name                                       AS theatre_name,
  sc.name                                      AS screen_name,
  sh.show_date,
  sh.start_time,
  sh.status                                    AS show_status,
  COUNT(se.id)                                 AS total_seats,
  COUNT(bs.id)                                 AS booked_seats,
  COUNT(se.id) - COUNT(bs.id)                  AS available_seats,
  ROUND(100 * COUNT(bs.id) / NULLIF(COUNT(se.id), 0), 1) AS occupancy_percent
FROM shows sh
JOIN movies   m  ON m.id  = sh.movie_id
JOIN screens  sc ON sc.id = sh.screen_id
JOIN theatres t  ON t.id  = sc.theatre_id
JOIN seats    se ON se.screen_id = sc.id AND se.is_active = 1
LEFT JOIN booking_seats bs
       ON bs.seat_id = se.id
      AND bs.show_id = sh.id
      AND bs.status  = 'CONFIRMED'
GROUP BY sh.id, m.title, t.name, sc.name, sh.show_date, sh.start_time, sh.status;

-- A flattened, ticket-shaped read model used by the confirmation page.
CREATE VIEW vw_booking_tickets AS
SELECT
  b.id                AS booking_id,
  b.booking_reference,
  b.status            AS booking_status,
  m.id                AS movie_id,
  m.title             AS movie_title,
  m.poster_url,
  m.certificate,
  m.duration_minutes,
  m.language,
  t.name              AS theatre_name,
  t.city,
  t.address,
  sc.name             AS screen_name,
  sc.screen_type,
  sh.show_date,
  sh.start_time,
  sh.end_time,
  sh.id               AS show_id,
  b.customer_name,
  b.customer_email,
  b.customer_phone,
  b.seat_count,
  b.subtotal,
  b.convenience_fee,
  b.total_amount,
  b.currency,
  b.created_at,
  b.confirmed_at,
  GROUP_CONCAT(
    CONCAT(bs_seat.row_label, LPAD(bs_seat.seat_number, 2, '0'))
    ORDER BY bs_seat.row_label, bs_seat.seat_number SEPARATOR ', '
  ) AS seat_labels
FROM bookings b
JOIN shows  sh ON sh.id = b.show_id
JOIN movies m  ON m.id  = sh.movie_id
JOIN screens sc ON sc.id = sh.screen_id
JOIN theatres t ON t.id  = sc.theatre_id
LEFT JOIN booking_seats bs ON bs.booking_id = b.id AND bs.status = 'CONFIRMED'
LEFT JOIN seats bs_seat    ON bs_seat.id = bs.seat_id
GROUP BY b.id;
