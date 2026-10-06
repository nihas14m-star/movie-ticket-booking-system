/**
 * MySQL connection pool.
 *
 * Every database access in the API goes through this module so that connection
 * settings, result coercion and transaction handling stay in one place.
 */
import mysql from 'mysql2/promise';
import env from '../config/env.js';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  // Store timestamps in UTC and let mysql2 convert them to JS Dates.
  timezone: 'Z',
  // DATE / TIME are returned verbatim ("2026-10-06", "19:30:00"); converting
  // them to JS Dates would silently shift them into the server time zone.
  dateStrings: ['DATE', 'TIME'],
  // DECIMAL columns (prices, ratings) become JS numbers instead of strings.
  decimalNumbers: true,
  namedPlaceholders: true,
  charset: 'utf8mb4_unicode_ci',
  enableKeepAlive: true,
});

/** Run a query and return just the rows. */
export async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Run a query and return the raw mysql2 result (rows + field metadata). */
export async function queryRaw(sql, params = {}) {
  return pool.execute(sql, params);
}

/**
 * Run a write statement and return the mysql2 result header
 * (insertId, affectedRows, ...). Use this for INSERT / UPDATE / DELETE so the
 * difference between "rows" and "header" is explicit at the call site.
 */
export async function execute(sql, params = {}) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * Run a SELECT either on a transaction connection or on the pool.
 *
 * mysql2's `connection.execute` resolves to a [rows, fields] tuple while our
 * `query()` helper already unwraps it. This normalises both so services can be
 * written once and work inside or outside a transaction.
 */
export async function queryWith(connection, sql, params = {}) {
  if (!connection) return query(sql, params);
  const [rows] = await connection.execute(sql, params);
  return rows;
}

/** Return the first row, or null. */
export async function queryOne(sql, params = {}) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * Execute `fn` inside a transaction. Any thrown error rolls the whole thing
 * back, which is what makes concurrent seat booking safe.
 *
 *   await withTransaction(async (conn) => { ... conn.execute(...) ... });
 */
export async function withTransaction(fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // A failed rollback must not mask the original error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

/** Call a stored procedure and return the result sets it produced. */
export async function callProcedure(name, params = []) {
  const placeholders = params.map(() => '?').join(', ');
  const [resultSets] = await pool.query(`CALL ${name}(${placeholders})`, params);
  return resultSets;
}

/** Lightweight health probe used by GET /api/health. */
export async function ping() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

/** The schema version the API expects; used as a friendly startup warning. */
export async function tableCount() {
  const rows = await query(
    `SELECT COUNT(*) AS total
       FROM information_schema.tables
      WHERE table_schema = :database`,
    { database: env.db.database },
  );
  return rows[0]?.total ?? 0;
}

export async function closePool() {
  await pool.end();
}

export default pool;
