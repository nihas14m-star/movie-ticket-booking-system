#!/usr/bin/env node
/**
 * Renders the Mermaid ER diagram in docs/ER_DIAGRAM.md to docs/er-diagram.svg.
 *
 *   npm run er-diagram
 *
 * It uses the real Mermaid grammar in a real browser (the Chrome or Edge you
 * already have, via playwright-core — no browser download), so a diagram that
 * fails to parse fails this script instead of surprising a reader on GitHub.
 * The output is a standalone SVG you can paste straight into a report.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'docs', 'ER_DIAGRAM.md');
const target = path.join(root, 'docs', 'er-diagram.svg');
const tmpPage = path.join(root, '.er-diagram-render.html');

const md = await fs.readFile(source, 'utf8');
const fence = '```';
const start = md.indexOf(`${fence}mermaid`);
if (start === -1) throw new Error(`No \`\`\`mermaid block found in ${source}`);
const end = md.indexOf(fence, start + fence.length + 'mermaid'.length);
const diagram = md.slice(start + fence.length + 'mermaid'.length, end).trim();

const html = `<!doctype html>
<meta charset="utf-8">
<title>Render ER diagram</title>
<body>
<div id="graph"></div>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: false, theme: 'neutral', er: { diagramPadding: 24 } });
try {
  const { svg } = await mermaid.render('er-diagram', ${JSON.stringify(diagram)});
  window.__SVG__ = svg;
  document.title = 'RENDER_OK';
} catch (error) {
  window.__SVG__ = null;
  document.title = 'RENDER_FAIL';
  window.__ERR__ = String(error?.message ?? error);
  document.getElementById('graph').textContent = window.__ERR__;
}
</script>
`;

const attempts = [{ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chromium' }];
let browser;
let lastError;
for (const options of attempts) {
  try {
    browser = await chromium.launch({ ...options, headless: true });
    console.log(`  browser: ${options.channel}`);
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!browser) {
  throw new Error(`Could not launch a browser. Install Chrome or Edge, or run "npx playwright install chromium".\n${lastError?.message}`);
}

try {
  await fs.writeFile(tmpPage, html);
  const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } });
  await page.goto(`file://${tmpPage.replace(/\\/g, '/')}`);
  await page.waitForFunction(() => window.__SVG__ !== undefined, null, { timeout: 30_000 });

  const [svg, error] = await page.evaluate(() => [window.__SVG__, window.__ERR__ ?? null]);
  if (!svg) throw new Error(`Mermaid refused to render the diagram:\n${error}`);

  // Drop the fixed max-width mermaid sets so the asset scales in a document.
  const cleaned = svg.replace(/ style="max-width:[^"]*"/, '').replace('<svg ', '<svg role="img" aria-label="CINEVERSE entity relationship diagram" ');
  await fs.writeFile(target, `${cleaned}\n`);
  console.log(`  parsed + rendered ${diagram.length} chars of Mermaid`);
  console.log(`  ✅ wrote ${path.relative(root, target)} (${(cleaned.length / 1024).toFixed(1)} kB)`);
} finally {
  await browser.close().catch(() => {});
  await fs.rm(tmpPage, { force: true });
}
