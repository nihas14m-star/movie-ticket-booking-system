#!/usr/bin/env node
/**
 * Database migration runner.
 *
 *   npm run db:setup       -> create schema + load sample data
 *   npm run db:reset       -> same thing (schema.sql always rebuilds cleanly)
 *   node src/db/migrate.js --schema-only
 *   node src/db/migrate.js --seed-only
 *
 * Uses a dedicated connection (no database selected) because schema.sql drops
 * and recreates the whole `cineverse` database.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import env, { PROJECT_ROOT } from '../config/env.js';
import { splitStatements, describeStatement } from './sqlFile.js';

const DATABASE_DIR = path.join(PROJECT_ROOT, 'database');

const args = new Set(process.argv.slice(2));
const schemaOnly = args.has('--schema-only');
const seedOnly = args.has('--seed-only');
const quiet = args.has('--quiet');

const log = (...parts) => {
  if (!quiet) console.log(...parts);
};

async function readScript(fileName) {
  const file = path.join(DATABASE_DIR, fileName);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    throw new Error(`Cannot read ${file} - is the database/ folder intact?`);
  }
}

async function runScript(connection, label, sql) {
  const statements = splitStatements(sql);
  log(`\n▶ ${label} (${statements.length} statements)`);
  let index = 0;
  for (const statement of statements) {
    index += 1;
    try {
      await connection.query(statement);
    } catch (error) {
      console.error(`\n✖ Failed on statement ${index}/${statements.length}:`);
      console.error(`  ${describeStatement(statement)}`);
      console.error(`  MySQL: ${error.code ?? ''} ${error.sqlMessage ?? error.message}`);
      throw error;
    }
  }
  log(`✔ ${label} completed`);
}

async function main() {
  const started = Date.now();

  log('CINEVERSE database migration');
  log(`  host     : ${env.db.host}:${env.db.port}`);
  log(`  database : ${env.db.database}`);
  log(`  user     : ${env.db.user}`);

  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: false,
    timezone: 'Z',
    charset: 'utf8mb4_unicode_ci',
  });

  try {
    if (!seedOnly) {
      await runScript(connection, 'database/schema.sql', await readScript('schema.sql'));
    }
    if (!schemaOnly) {
      await runScript(connection, 'database/seed.sql', await readScript('seed.sql'));
    }

    // Report the freshly loaded row counts so the operator sees real numbers.
    const [summary] = await connection.query(`
      SELECT 'movies' AS entity, COUNT(*) AS total FROM ${env.db.database}.movies
      UNION ALL SELECT 'seats',          COUNT(*) FROM ${env.db.database}.seats
      UNION ALL SELECT 'shows',          COUNT(*) FROM ${env.db.database}.shows
      UNION ALL SELECT 'bookings',       COUNT(*) FROM ${env.db.database}.bookings
      UNION ALL SELECT 'payments',       COUNT(*) FROM ${env.db.database}.payments`);

    if (!quiet) {
      console.log('\nRow counts');
      for (const row of summary) {
        console.log(`  ${String(row.entity).padEnd(10)} ${row.total}`);
      }
    }

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n✅ Database ready in ${seconds}s -> ${env.db.database}`);
    // These must match database/seed.sql, otherwise the first thing a reviewer
    // tries is an account that does not exist.
    console.log('   Demo logins: nihas@cineverse.dev / admin123 (admin)   ·   demo@cineverse.dev / password123 (customer)');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('\n❌ Migration failed.');
  if (error.code === 'ECONNREFUSED') {
    console.error('   MySQL is not reachable. Is the server running and are DB_HOST/DB_PORT correct?');
  }
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('   Check DB_USER / DB_PASSWORD in your .env file.');
  }
  process.exitCode = 1;
});
