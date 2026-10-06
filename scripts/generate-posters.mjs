#!/usr/bin/env node
/**
 * Poster generator.
 *
 *   node scripts/generate-posters.mjs
 *
 * Writes one SVG poster per movie into frontend/public/posters/.
 *
 * Why generated art instead of real posters?
 *   - the demo then works completely offline, with no hotlinked images that can
 *     404 or slow the page down,
 *   - it ships with the project (no copyright questions for a college submission),
 *   - and swapping in real artwork is a one-line change: point `movies.poster_url`
 *     at any URL and it is used as-is.
 *
 * Each poster is deterministic: the same title always produces the same art.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, '..', 'frontend', 'public', 'posters');

const W = 600;
const H = 900;

/** Small deterministic PRNG so a title always yields the same poster. */
function makeRandom(seed) {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ motifs */

const MOTIFS = {
  grid: (r, c) => {
    const lines = [];
    for (let i = 0; i <= 14; i += 1) {
      const x = (i / 14) * W;
      lines.push(`<line x1="${x}" y1="${H * 0.52}" x2="${W / 2 + (x - W / 2) * 2.6}" y2="${H}" stroke="${c.line}" stroke-width="1.4" opacity="0.5"/>`);
    }
    for (let i = 1; i <= 9; i += 1) {
      const p = i / 9;
      const y = H * 0.52 + Math.pow(p, 2.1) * H * 0.48;
      lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${c.line}" stroke-width="1.2" opacity="${0.22 + p * 0.3}"/>`);
    }
    const sun = `<circle cx="${W * 0.62}" cy="${H * 0.44}" r="112" fill="url(#glow)"/>`;
    return sun + lines.join('');
  },

  rays: (r, c) => {
    const beams = [];
    for (let i = 0; i < 22; i += 1) {
      const angle = (i / 22) * Math.PI - Math.PI / 2;
      const spread = 0.028 + r() * 0.05;
      const x1 = W / 2 + Math.sin(angle - spread) * 40;
      const y1 = H * 0.66 + Math.cos(angle - spread) * 40;
      const x2 = W / 2 + Math.sin(angle - spread) * 1200;
      const y2 = H * 0.66 + Math.cos(angle - spread) * 1200;
      const x3 = W / 2 + Math.sin(angle + spread) * 1200;
      const y3 = H * 0.66 + Math.cos(angle + spread) * 1200;
      beams.push(`<path d="M${x1} ${y1} L${x2} ${y2} L${x3} ${y3} Z" fill="${c.line}" opacity="${(0.06 + r() * 0.16).toFixed(3)}"/>`);
    }
    return beams.join('') + `<circle cx="${W / 2}" cy="${H * 0.66}" r="128" fill="url(#glow)"/>`;
  },

  peaks: (r, c) => {
    let out = `<circle cx="${W * 0.7}" cy="${H * 0.3}" r="86" fill="url(#glow)" opacity="0.9"/>`;
    for (let layer = 0; layer < 3; layer += 1) {
      const baseY = H * (0.55 + layer * 0.12);
      const points = [`0,${H}`, `0,${baseY}`];
      for (let i = 1; i <= 6; i += 1) {
        points.push(`${(i / 6) * W},${baseY - (r() * (90 - layer * 22))}`);
      }
      points.push(`${W},${baseY}`, `${W},${H}`);
      out += `<polygon points="${points.join(' ')}" fill="${c.deep}" opacity="${0.55 + layer * 0.16}"/>`;
    }
    return out;
  },

  orbit: (r, c) => {
    let out = `<circle cx="${W / 2}" cy="${H * 0.42}" r="196" fill="url(#glow)"/>`;
    for (let i = 1; i <= 6; i += 1) {
      const rx = 120 + i * 44;
      const ry = (120 + i * 44) * (0.26 + r() * 0.12);
      out += `<ellipse cx="${W / 2}" cy="${H * 0.42}" rx="${rx}" ry="${ry}" fill="none" stroke="${c.line}" stroke-width="${i === 3 ? 3 : 1.3}" opacity="${i === 3 ? 0.7 : 0.32}" transform="rotate(${-16 + i * 5} ${W / 2} ${H * 0.42})"/>`;
    }
    out += `<circle cx="${W * 0.72}" cy="${H * 0.31}" r="26" fill="${c.accent}" opacity="0.95"/>`;
    out += `<circle cx="${W * 0.31}" cy="${H * 0.52}" r="15" fill="${c.line}" opacity="0.8"/>`;
    return out;
  },

  waves: (r, c) => {
    let out = '';
    for (let i = 0; i < 7; i += 1) {
      const y = H * (0.4 + i * 0.075);
      const amp = 34 + r() * 44;
      const d = `M0 ${y} C ${W * 0.25} ${y - amp}, ${W * 0.5} ${y + amp}, ${W * 0.75} ${y - amp * 0.6} S ${W} ${y + amp * 0.5}, ${W} ${y}`;
      out += `<path d="${d}" fill="none" stroke="${i % 2 ? c.line : c.accent}" stroke-width="${i === 3 ? 3.4 : 1.7}" opacity="${0.22 + i * 0.1}"/>`;
    }
    return out + `<circle cx="${W * 0.78}" cy="${H * 0.24}" r="70" fill="url(#glow)"/>`;
  },

  bars: (r, c) => {
    let out = '';
    const count = 17;
    for (let i = 0; i < count; i += 1) {
      const barW = W / count - 6;
      const height = 60 + r() * 420;
      const x = i * (W / count) + 3;
      out += `<rect x="${x}" y="${H * 0.68 - height}" width="${barW}" height="${height}" rx="4" fill="${i % 4 === 0 ? c.accent : c.line}" opacity="${(0.3 + r() * 0.5).toFixed(2)}"/>`;
    }
    return out;
  },

  circuit: (r, c) => {
    let out = '';
    for (let i = 0; i < 16; i += 1) {
      let x = r() * W;
      let y = r() * H * 0.72;
      let d = `M${x} ${y}`;
      for (let step = 0; step < 3; step += 1) {
        if (r() > 0.5) x += (r() - 0.5) * 220;
        else y += (r() - 0.5) * 220;
        d += ` L${x} ${y}`;
      }
      out += `<path d="${d}" fill="none" stroke="${c.line}" stroke-width="1.6" opacity="${(0.2 + r() * 0.4).toFixed(2)}"/>`;
      out += `<circle cx="${x}" cy="${y}" r="4.5" fill="${c.accent}" opacity="0.9"/>`;
    }
    return out + `<circle cx="${W * 0.5}" cy="${H * 0.3}" r="96" fill="url(#glow)"/>`;
  },

  arch: (r, c) => {
    let out = '';
    for (let i = 0; i < 4; i += 1) {
      const inset = 40 + i * 52;
      const top = H * (0.28 + i * 0.045);
      out += `<path d="M${inset} ${H * 0.78} L${inset} ${top + 120} Q${W / 2} ${top - 60} ${W - inset} ${top + 120} L${W - inset} ${H * 0.78}" fill="none" stroke="${i % 2 ? c.line : c.accent}" stroke-width="${i === 1 ? 3.4 : 1.8}" opacity="${0.28 + i * 0.16}"/>`;
    }
    return out + `<circle cx="${W / 2}" cy="${H * 0.33}" r="78" fill="url(#glow)"/>`;
  },

  dots: (r, c) => {
    let out = '';
    for (let y = 0; y < 22; y += 1) {
      for (let x = 0; x < 15; x += 1) {
        const cx = 24 + x * 40 + (y % 2 ? 20 : 0);
        const cy = 40 + y * 32;
        const radius = Math.max(0.6, r() * 5.4);
        out += `<circle cx="${cx}" cy="${cy}" r="${radius.toFixed(2)}" fill="${c.line}" opacity="${(0.14 + r() * 0.5).toFixed(2)}"/>`;
      }
    }
    return out + `<circle cx="${W * 0.5}" cy="${H * 0.42}" r="150" fill="url(#glow)" opacity="0.85"/>`;
  },

  blade: (r, c) => {
    let out = `<circle cx="${W * 0.35}" cy="${H * 0.35}" r="120" fill="url(#glow)"/>`;
    for (let i = 0; i < 9; i += 1) {
      const x = -160 + i * 92;
      out += `<polygon points="${x},${H} ${x + 46},${H} ${x + 210},${H * 0.36} ${x + 176},${H * 0.36}" fill="${c.line}" opacity="${(0.12 + r() * 0.26).toFixed(2)}"/>`;
    }
    return out;
  },

  bubbles: (r, c) => {
    let out = '';
    for (let i = 0; i < 30; i += 1) {
      const cx = r() * W;
      const cy = H * 0.08 + r() * H * 0.7;
      const radius = 6 + r() * 54;
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="none" stroke="${c.line}" stroke-width="1.5" opacity="${(0.16 + r() * 0.4).toFixed(2)}"/>`;
    }
    return out + `<circle cx="${W * 0.5}" cy="${H * 0.3}" r="110" fill="url(#glow)"/>`;
  },

  forge: (r, c) => {
    let out = `<circle cx="${W * 0.66}" cy="${H * 0.26}" r="94" fill="url(#glow)"/>`;
    for (let i = 0; i < 26; i += 1) {
      const x = r() * W;
      const y = H * 0.16 + r() * H * 0.52;
      const len = 20 + r() * 120;
      const angle = (-40 + r() * 80) * (Math.PI / 180);
      out += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + Math.cos(angle) * len).toFixed(1)}" y2="${(y + Math.sin(angle) * len).toFixed(1)}" stroke="${i % 5 === 0 ? c.accent : c.line}" stroke-width="${i % 5 === 0 ? 3 : 1.5}" opacity="${(0.2 + r() * 0.45).toFixed(2)}" stroke-linecap="round"/>`;
    }
    return out;
  },
};

/* ------------------------------------------------------------- title setup */

function wrapTitle(title, maxChars = 15, maxLines = 3) {
  const words = title.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function buildPoster(movie) {
  const random = makeRandom(movie.slug);
  const { from, to, accent, deep, line } = movie.palette;
  const colors = { line, accent, deep };
  const motif = (MOTIFS[movie.motif] ?? MOTIFS.grid)(random, colors);

  const titleLines = wrapTitle(movie.title);
  const titleSize = titleLines.length > 2 ? 58 : titleLines.length > 1 ? 66 : 76;
  const lineHeight = titleSize * 1.06;
  const titleBottom = H - 152;
  const titleTop = titleBottom - (titleLines.length - 1) * lineHeight;

  const titleSvg = titleLines
    .map((line, index) => `
    <text x="46" y="${(titleTop + index * lineHeight).toFixed(0)}" font-family="'Helvetica Neue',Inter,Arial,sans-serif" font-size="${titleSize}" font-weight="800" letter-spacing="-2" fill="#ffffff">${esc(line)}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(movie.title)} poster">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="58%" stop-color="${to}"/>
      <stop offset="100%" stop-color="#04050a"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="${accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shade" x1="0" y1="0.35" x2="0" y2="1">
      <stop offset="0%" stop-color="#04050a" stop-opacity="0"/>
      <stop offset="62%" stop-color="#04050a" stop-opacity="0.78"/>
      <stop offset="100%" stop-color="#04050a" stop-opacity="0.97"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g>${motif}</g>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.05"/>

  <g opacity="0.9">
    <rect x="46" y="46" width="46" height="3" fill="${accent}"/>
    <text x="46" y="80" font-family="'Helvetica Neue',Inter,Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="4.4" fill="#ffffff" opacity="0.86">CINEVERSE</text>
    <text x="46" y="104" font-family="'Helvetica Neue',Inter,Arial,sans-serif" font-size="13" letter-spacing="3.2" fill="${accent}" opacity="0.95">${esc(movie.eyebrow.toUpperCase())}</text>
  </g>

  ${titleSvg}

  <g>
    <rect x="46" y="${titleBottom + 34}" width="88" height="2" fill="${accent}"/>
    <text x="46" y="${titleBottom + 66}" font-family="'Helvetica Neue',Inter,Arial,sans-serif" font-size="15" letter-spacing="1.6" fill="#ffffff" opacity="0.78">${esc(movie.meta.toUpperCase())}</text>
  </g>
</svg>
`;
}

/* -------------------------------------------------------------------- data */

const MOVIES = [
  { file: 'neon-horizon', title: 'Neon Horizon', eyebrow: 'A future worth burning for', meta: 'Sci-Fi · Action · 2h 22m', motif: 'grid', palette: { from: '#12203f', to: '#2a1a4d', accent: '#38e1ff', deep: '#070b1c', line: '#6ee7ff' } },
  { file: 'kalari', title: 'Kalari: Rise of the Warrior', eyebrow: 'The art they tried to erase', meta: 'Action · Drama · 2h 35m', motif: 'peaks', palette: { from: '#3a1410', to: '#5c2a06', accent: '#ff9f43', deep: '#120604', line: '#ffb469' } },
  { file: 'the-last-monsoon', title: 'The Last Monsoon', eyebrow: 'Two banks, one river', meta: 'Drama · Romance · 2h 08m', motif: 'waves', palette: { from: '#08303a', to: '#0d4557', accent: '#38e1ff', deep: '#04161c', line: '#9fe6ff' } },
  { file: 'pixel-pals', title: 'Pixel Pals', eyebrow: 'Four friends, one machine', meta: 'Animation · Family · 1h 36m', motif: 'dots', palette: { from: '#2b1b4d', to: '#4a2470', accent: '#ff4d6d', deep: '#120a26', line: '#ffd1dc' } },
  { file: 'silent-frequency', title: 'Silent Frequency', eyebrow: 'Static never lies', meta: 'Horror · Thriller · 1h 58m', motif: 'bars', palette: { from: '#160d1f', to: '#2c1030', accent: '#a855f7', deep: '#08040d', line: '#e9d5ff' } },
  { file: 'coastal-run', title: 'Coastal Run', eyebrow: '400 km. One stolen car.', meta: 'Comedy · Action · 2h 14m', motif: 'blade', palette: { from: '#12321f', to: '#1f4d2b', accent: '#f5a524', deep: '#061409', line: '#bbe7a6' } },
  { file: 'zero-gravity', title: 'Zero Gravity', eyebrow: 'It is still awake', meta: 'Sci-Fi · Thriller · 2h 29m', motif: 'orbit', palette: { from: '#0a1030', to: '#1b1246', accent: '#7c5cff', deep: '#04061a', line: '#cdb8ff' } },
  { file: 'the-silk-route', title: 'The Silk Route', eyebrow: 'Three courts, one road', meta: 'Adventure · Drama · 2h 17m', motif: 'arch', palette: { from: '#3b2606', to: '#5a3a0c', accent: '#ffb020', deep: '#150d02', line: '#ffd89b' } },
  { file: 'echoes-of-tomorrow', title: 'Echoes of Tomorrow', eyebrow: 'Thirty seconds ahead', meta: 'Sci-Fi · Mystery · 2h 11m', motif: 'circuit', palette: { from: '#0b2438', to: '#123a52', accent: '#38e1ff', deep: '#04121c', line: '#a5eeff' } },
  { file: 'rangoli-nights', title: 'Rangoli Nights', eyebrow: 'One kitchen, three generations', meta: 'Romance · Comedy · 2h 01m', motif: 'rays', palette: { from: '#43112a', to: '#5e2038', accent: '#ff4d6d', deep: '#170409', line: '#ffc2d1' } },
  { file: 'deep-blue-silence', title: 'Deep Blue Silence', eyebrow: 'Two kilometres down, two heartbeats', meta: 'Thriller · Mystery · 1h 53m', motif: 'bubbles', palette: { from: '#06203c', to: '#0a3358', accent: '#38e1ff', deep: '#020c16', line: '#9fd8ff' } },
  { file: 'skyforge-legends', title: 'Skyforge Legends', eyebrow: 'Hammer storms into steel', meta: 'Fantasy · Adventure · 1h 44m', motif: 'forge', palette: { from: '#2d1436', to: '#472250', accent: '#f5a524', deep: '#100618', line: '#ffe3a8' } },
];

/* -------------------------------------------------------------------- main */

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const movie of MOVIES) {
    const slug = movie.file;
    const svg = buildPoster({
      slug,
      title: movie.title,
      eyebrow: movie.eyebrow,
      meta: movie.meta,
      motif: movie.motif,
      palette: movie.palette,
    });
    await fs.writeFile(path.join(OUT_DIR, `${slug}.svg`), svg, 'utf8');
  }

  // A neutral placeholder for movies added through the admin panel.
  const placeholder = buildPoster({
    slug: 'placeholder',
    title: 'Coming Soon',
    eyebrow: 'Cineverse',
    meta: 'Poster pending',
    motif: 'dots',
    palette: { from: '#141726', to: '#1f2338', accent: '#7c5cff', deep: '#0a0c14', line: '#c7c9de' },
  });
  await fs.writeFile(path.join(OUT_DIR, 'placeholder.svg'), placeholder, 'utf8');

  console.log(`✅ Wrote ${MOVIES.length + 1} posters to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((error) => {
  console.error('Poster generation failed:', error);
  process.exitCode = 1;
});
