#!/usr/bin/env node
/**
 * Screenshot capture for the project documentation.
 *
 *   npm run dev            # in one terminal (API on :5000, web on :5173)
 *   node scripts/screenshots.mjs
 *
 * Writes PNGs into docs/screenshots/.
 *
 * It drives a real browser (the Chrome or Edge you already have installed, via
 * playwright-core — no browser download) and walks the actual booking flow:
 * home -> movie -> seats -> checkout -> ticket, plus the admin console and a
 * mobile viewport. Everything it captures is the live application.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, '..', 'docs', 'screenshots');
const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173';
const API = process.env.SCREENSHOT_API_URL ?? 'http://localhost:5000';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const log = (message) => console.log(`  ${message}`);

async function launch() {
  const attempts = [
    { channel: 'chrome' },
    { channel: 'msedge' },
    { channel: 'chromium' },
  ];
  let lastError;
  for (const options of attempts) {
    try {
      const browser = await chromium.launch({ ...options, headless: true });
      log(`browser: ${options.channel}`);
      return browser;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Could not launch a browser. Install Chrome or Edge, or run "npx playwright install chromium".\n${lastError?.message}`,
  );
}

/** Wait for the app to finish its initial data fetch. */
async function settle(page, ms = 900) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

const failures = [];

async function shoot(page, name, { fullPage = false } = {}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  log(`captured ${path.relative(process.cwd(), file)}`);
}

/**
 * Run one capture step. A step that fails is reported and skipped so a single
 * changed selector cannot cost us the whole set of screenshots.
 */
async function step(label, fn) {
  try {
    await fn();
  } catch (error) {
    failures.push(`${label}: ${error.message.split('\n')[0]}`);
    console.log(`  ⚠ skipped ${label} — ${error.message.split('\n')[0]}`);
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Fail fast with a useful message if the stack is not running.
  try {
    const response = await fetch(`${API}/api/health`);
    const health = await response.json();
    if (health.status !== 'ok') throw new Error(`API reported status "${health.status}"`);
  } catch (error) {
    console.error(`\n✖ The API at ${API} is not ready (${error.message}).`);
    console.error('  Start the stack first:  npm run dev\n');
    process.exit(1);
  }

  const browser = await launch();
  const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  console.log('\nCapturing CINEVERSE screenshots…');

  // ---------------------------------------------------------------- home
  await step('home hero', async () => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.hero-title');
    await page.waitForTimeout(1600); // let the hero slide fade in
    await shoot(page, '01-home-hero');

    await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
    await settle(page, 500);
    await shoot(page, '02-home-now-showing');

    await page.evaluate(() => window.scrollTo({ top: 1900, behavior: 'instant' }));
    await settle(page, 500);
    await shoot(page, '03-home-ai-recommendations');
  });

  await step('home genre filter', async () => {
    await page.getByRole('button', { name: 'Comedy' }).first().click();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo({ top: 520, behavior: 'instant' }));
    await shoot(page, '04-home-genre-filter');
  });

  await step('AI natural-language search', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.getByRole('button', { name: 'All genres' }).click();
    await page.waitForTimeout(300);
    await page.locator('.search-shell input[type="search"]').fill('action movies under 2.5 hours');
    await page.getByRole('button', { name: 'Ask AI' }).click();
    await page.locator('.search-shell button[type="submit"]').click();
    // The banner tone depends on whether OpenRouter answered or the fallback did.
    await page.waitForSelector('.alert:has-text("AI search")', { timeout: 20000 });
    await page.waitForTimeout(600);
    await shoot(page, '05-home-ai-search');
  });

  await step('movie details', async () => {
    await page.goto(`${BASE}/movies/neon-horizon`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.detail-grid');
    await settle(page);
    await shoot(page, '06-movie-details');

    await page.evaluate(() => document.getElementById('showtimes')?.scrollIntoView({ behavior: 'instant' }));
    await page.waitForSelector('.theatre-block');
    await page.waitForTimeout(600);
    await shoot(page, '07-theatres-showtimes');
  });

  await step('seat selection', async () => {
    // Pick the first screening that still has seats.
    await page.locator('.show-slot:not([disabled])').first().click();
    await page.waitForSelector('.seat-layout', { timeout: 20000 });
    await settle(page, 700);

    // Select three seats that are actually free, exactly like a real user.
    await page.locator('.seat.is-available').first().click();
    const more = page.locator('.seat.is-available');
    const total = Math.min(3, await more.count());
    for (let index = 1; index < total; index += 1) {
      const candidate = more.nth(index * 2);
      if (await candidate.count()) await candidate.click();
      await page.waitForTimeout(160);
    }
    await page.waitForTimeout(400);
    await shoot(page, '08-seat-selection');

    await page.evaluate(() => window.scrollTo({ top: 520, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shoot(page, '09-seat-categories');
  });

  await step('checkout', async () => {
    await page.locator('.summary-panel button.btn-primary').click();
    await page.waitForURL('**/checkout**', { timeout: 20000 });
    await page.waitForSelector('#name');
    await settle(page);

    await page.fill('#name', 'Nihas');
    await page.fill('#email', 'nihas.booking@cineverse.dev');
    await page.fill('#phone', '+91 98490 11001');
    await page.waitForTimeout(300);
    await shoot(page, '10-checkout-details');

    await page.locator('button[type="submit"]:has-text("Continue to payment")').click();
    await page.waitForSelector('.pay-methods', { timeout: 20000 });
    await page.waitForTimeout(600);
    await shoot(page, '11-checkout-payment');
  });

  await step('booking confirmation', async () => {
    // The pay button is the only full-width primary button in the payment card;
    // "Pay " alone would also match the "Pay by UPI id" method tile.
    await page.locator('button.btn-primary.btn-block:has-text("Pay ")').click();
    await page.waitForURL('**/ticket/**', { timeout: 25000 });
    await page.waitForSelector('.ticket-code', { timeout: 20000 });
    await page.waitForTimeout(2600); // confetti + check animation
    await shoot(page, '12-booking-confirmed');

    await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shoot(page, '13-digital-ticket');
    log(`booking reference used: ${(await page.locator('.ticket-code').innerText()).trim()}`);
  });

  await step('find my bookings', async () => {
    await page.goto(`${BASE}/my-bookings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#lookupEmail');
    await page.fill('#lookupEmail', 'nihas.booking@cineverse.dev');
    await page.locator('button:has-text("Search bookings")').click();
    await page.waitForSelector('.booking-row', { timeout: 20000 });
    await settle(page, 400);
    await shoot(page, '14-my-bookings');
  });

  await step('AI assistant', async () => {
    await page.goto(`${BASE}/movies/zero-gravity`, { waitUntil: 'domcontentloaded' });
    await settle(page, 700);
    await page.locator('.ai-fab').click();
    await page.waitForSelector('.ai-panel');
    await page.locator('.ai-suggestion').first().click();
    await page.waitForTimeout(2200);
    await shoot(page, '15-ai-assistant');
  });

  // --------------------------------------------------------- admin console
  const admin = await context.newPage();
  admin.on('pageerror', (error) => errors.push(`admin: ${error.message}`));

  await step('admin login', async () => {
    await admin.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
    await admin.waitForSelector('#adminEmail');
    await admin.fill('#adminEmail', 'nihas@cineverse.dev');
    await admin.fill('#adminPassword', 'admin123');
    await admin.waitForTimeout(300);
    await shoot(admin, '16-admin-login');

    await admin.locator('button[type="submit"]').click();
    await admin.waitForURL('**/admin/dashboard', { timeout: 25000 });
    await admin.waitForSelector('.stat-card');
    await settle(admin);
    await shoot(admin, '17-admin-dashboard');
  });

  await step('admin movies', async () => {
    await admin.goto(`${BASE}/admin/movies`, { waitUntil: 'domcontentloaded' });
    await admin.waitForSelector('table.data');
    await settle(admin, 500);
    await shoot(admin, '18-admin-movies');
  });

  await step('admin theatres & screens', async () => {
    await admin.goto(`${BASE}/admin/theatres`, { waitUntil: 'domcontentloaded' });
    await admin.waitForSelector('.panel');
    await settle(admin, 500);
    await shoot(admin, '19-admin-theatres');
  });

  await step('admin bookings', async () => {
    await admin.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await admin.waitForSelector('table.data');
    await settle(admin, 500);
    await shoot(admin, '20-admin-bookings');
  });

  // --------------------------------------------------------------- mobile
  const mobileContext = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();

  await step('mobile home', async () => {
    await mobile.goto(BASE, { waitUntil: 'domcontentloaded' });
    await mobile.waitForSelector('.hero-title');
    await mobile.waitForTimeout(1500);
    await shoot(mobile, '21-mobile-home');
  });

  await step('mobile showtimes', async () => {
    await mobile.goto(`${BASE}/movies/neon-horizon`, { waitUntil: 'domcontentloaded' });
    await mobile.waitForSelector('.detail-grid');
    await mobile.evaluate(() => document.getElementById('showtimes')?.scrollIntoView({ behavior: 'instant' }));
    await mobile.waitForSelector('.theatre-block');
    await mobile.waitForTimeout(700);
    await shoot(mobile, '22-mobile-showtimes');
  });

  await mobileContext.close();
  await context.close();
  await browser.close();

  // ----------------------------------------------------------------- report
  const files = (await fs.readdir(OUT_DIR)).filter((file) => file.endsWith('.png'));
  console.log(`\n✅ ${files.length} screenshots written to docs/screenshots/`);

  if (failures.length) {
    console.log('\n⚠️ Steps that could not be captured:');
    for (const failure of failures) console.log(`   • ${failure}`);
  }

  if (errors.length) {
    console.log('\n⚠️ Browser console reported:');
    for (const message of [...new Set(errors)].slice(0, 12)) console.log(`   • ${message}`);
    process.exitCode = 0;
  } else {
    console.log('   No console errors were reported while capturing.');
  }
}

main().catch((error) => {
  console.error('\n❌ Screenshot capture failed:', error.message);
  process.exitCode = 1;
});
