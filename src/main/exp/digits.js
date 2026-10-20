// Reads the game's EXP numbers ("30,146[74.41%]") by matching its pixel-font digits.
//
// MapleStory Classic draws at 768 pixels tall and the result is scaled up to the screen, so every
// character sits at a fixed spacing in the game's own pixels: digits advance 6, the comma 5, the
// bracket 6 and the dot 4. The green "[" after the EXP number is the anchor: it is the only green
// text, so the "EXP." label (or anything else) to the left can't be mistaken for the number. Its
// height gives the text rows, and the number is laid out leftwards from it. We try each possible
// layout, cut every character at its exact position, and keep the layout with the most digits that
// match the templates well.
//
// A reading is "sure" when every digit is a clear match. Blurrier digits (a screen size the
// templates weren't cut from) still give a reading, marked unsure, as long as no digit is far off;
// the validator only lets an unsure reading confirm what sure ones established.
//
// Templates (digit-templates.json) are cut from real captures with known text; every instance is
// kept, since each copy lands on the screen's pixels a little differently.

const GRID_W = 5; // one cell per game pixel of the 5-wide, 8-tall digits
const GRID_H = 8;
const NATIVE_HEIGHT = 768;
const ADVANCE = { d: 6, ',': 5, '[': 6, '.': 4 }; // in the game's own pixels
const GLYPH_WIDTH = 5; // a digit's drawn width, in the game's own pixels
const BRACKET_INK = 2.33; // where the "[" ink starts inside its character cell, in game pixels
const BRACKET_SEARCH = 1.5; // …give or take this much
const BRACKET_MIN_HEIGHT = 5; // the "[" is about 7 game pixels tall
const MAX_DISTANCE = 0.07; // sure: mean per-cell difference allowed for a digit match
const MIN_MARGIN = 0.025; // sure: the best digit must beat every other digit by this much
const UNSURE_MAX_DISTANCE = 0.14; // unsure: no digit may be further off than this
const DIGIT_REWARD = 0.14; // per digit in a layout, so longer layouts of good digits win
const SEPARATOR_PENALTY = 0.25;

let templates = null;
const loadTemplates = () => templates || (templates = require('./digit-templates.json').digits);

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const isGreen = (d, i) => d[i + 1] > 110 && d[i + 1] - d[i + 2] > 60 && d[i + 1] > d[i] + 5;

function luminanceGrid(img) {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = lum(img.data, i * 4);
  return out;
}

// Bright text on the darker status bar: threshold halfway between the typical and brightest pixel.
function textThreshold(values) {
  const sorted = Float32Array.from(values).sort();
  const median = sorted[Math.floor(sorted.length / 2)];
  const bright = sorted[Math.floor(sorted.length * 0.99)];
  return bright - median < 40 ? null : (median + bright) / 2;
}

// Green brackets: each tall run of green that stops short of the crop's bottom (the EXP gauge below
// is green too, but it is a wide band along the bottom), left to right, one per bracket.
function findBrackets(img, scale) {
  const found = [];
  for (let x = 0; x < img.width; x++) {
    let run = 0;
    let hit = null;
    for (let y = 0; y < img.height && !hit; y++) {
      if (isGreen(img.data, (y * img.width + x) * 4)) run++;
      else if (run) {
        if (run >= BRACKET_MIN_HEIGHT * scale) hit = { x, y0: y - run, y1: y - 1 };
        run = 0;
      }
    }
    const last = found[found.length - 1];
    if (hit && !(last && last.lastX === x - 1)) found.push({ ...hit, lastX: x });
    else if (hit) last.lastX = x;
  }
  return found.map(({ lastX, ...b }) => b);
}

// The "[" of the EXP crop: its leftmost bracket.
const findBracket = (img, scale) => findBrackets(img, scale)[0] || null;

// Everything decoding needs from a crop: luminance, threshold, text rows and the bracket.
function prepare(img, scale) {
  const bracket = findBracket(img, scale);
  if (!bracket) return null;
  // Digits stand about half a game pixel taller than the bracket.
  const band = { y0: Math.max(0, Math.round(bracket.y0 - 0.5 * scale)), y1: bracket.y1 };
  const L = luminanceGrid(img);
  const t = textThreshold(L.subarray(band.y0 * img.width, (band.y1 + 1) * img.width));
  return t === null ? null : { L, t, band, bracket, width: img.width };
}

// Sample the area x0..x1 (may be fractional) × the text band into a GRID_W × GRID_H grid of 0..1.
function features({ L, width, band, t }, x0, x1) {
  const out = new Float32Array(GRID_W * GRID_H);
  const w = x1 - x0;
  const h = band.y1 - band.y0 + 1;
  for (let gy = 0; gy < GRID_H; gy++)
    for (let gx = 0; gx < GRID_W; gx++) {
      const xa = x0 + (gx * w) / GRID_W;
      const xb = x0 + ((gx + 1) * w) / GRID_W;
      const ya = band.y0 + (gy * h) / GRID_H;
      const yb = band.y0 + ((gy + 1) * h) / GRID_H;
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(ya); y < Math.max(Math.ceil(yb), Math.floor(ya) + 1); y++)
        for (let x = Math.floor(xa); x < Math.max(Math.ceil(xb), Math.floor(xa) + 1); x++) {
          if (x < 0 || x >= width) continue;
          sum += Math.min(1, Math.max(0, (L[y * width + x] - t * 0.6) / (t * 0.8)));
          n++;
        }
      out[gy * GRID_W + gx] = n ? sum / n : 0;
    }
  return out;
}

const distance = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

// Best digit for a cell: { digit, d, margin } (nearest template instance per digit).
function matchDigit(feat, templateSet) {
  const scored = Object.entries(templateSet)
    .map(([digit, instances]) => ({ digit, d: Math.min(...instances.map((tpl) => distance(feat, tpl))) }))
    .sort((a, b) => a.d - b.d);
  return { digit: scored[0].digit, d: scored[0].d, margin: scored[1].d - scored[0].d };
}

// Every way the number can be laid out before the bracket: 1–10 EXP digits (thousands commas);
// and after it: 1–2 digits, ., 2 digits.
const EXP_LAYOUTS = [];
for (let n = 1; n <= 10; n++) {
  const exp = [];
  for (let i = 0; i < n; i++) {
    if (i > 0 && (n - i) % 3 === 0) exp.push(',');
    exp.push('d');
  }
  EXP_LAYOUTS.push(exp);
}
const PCT_LAYOUTS = [
  ['d', '.', 'd', 'd'],
  ['d', 'd', '.', 'd', 'd'],
];
const advanceOf = (kinds) => kinds.reduce((sum, k) => sum + ADVANCE[k], 0);

// Does a separator cell look right? Commas and dots sit low (top 60% dark). Only the middle of the
// cell is checked: its edges can catch the neighbouring digits when the alignment is a little off.
function separatorFits({ L, width, band, t }, x0, x1, scale) {
  const h = band.y1 - band.y0 + 1;
  let bright = 0;
  for (let y = band.y0; y < band.y0 + 0.6 * h; y++)
    for (let x = Math.ceil(x0 + scale); x < Math.floor(x1 - scale); x++) if (x >= 0 && x < width && L[Math.floor(y) * width + x] >= t) bright++;
  return bright <= 1;
}

// Where the "[" cell starts, for each candidate alignment around the expected ink offset.
function bracketCellStarts(p, scale) {
  const out = [];
  for (let ink = BRACKET_INK - BRACKET_SEARCH; ink <= BRACKET_INK + BRACKET_SEARCH + 1e-9; ink += 0.25 / scale) out.push(p.bracket.x - ink * scale);
  return out;
}

// Lay out `kinds` from x: each cell's start, or null if the layout runs off the crop.
function place(kinds, x, scale, width) {
  const cells = [];
  for (const kind of kinds) {
    if (x < -scale || x + ADVANCE[kind] * scale > width + scale) return null;
    cells.push({ kind, x });
    x += ADVANCE[kind] * scale;
  }
  return cells;
}

// Decode the crop with `scale` screen pixels per game pixel: the best-fitting layout's cells.
function decode(img, scale, templateSet = loadTemplates()) {
  const p = prepare(img, scale);
  if (!p) return null;
  const cache = new Map();
  const cell = (x) => {
    const key = x.toFixed(3); // exact: advances like 11.25 px don't sit on a half-pixel grid
    if (!cache.has(key)) cache.set(key, matchDigit(features(p, x, x + GLYPH_WIDTH * scale), templateSet));
    return cache.get(key);
  };

  let best = null;
  for (const start of bracketCellStarts(p, scale)) {
    for (const exp of EXP_LAYOUTS) {
      for (const pct of PCT_LAYOUTS) {
        const kinds = [...exp, '[', ...pct];
        const cells = place(kinds, start - advanceOf(exp) * scale, scale, img.width);
        if (!cells) continue;
        let score = 0;
        for (const c of cells) {
          if (c.kind === 'd') {
            Object.assign(c, cell(c.x));
            score += c.d - DIGIT_REWARD;
          } else if (c.kind !== '[' && !separatorFits(p, c.x, c.x + ADVANCE[c.kind] * scale, scale)) score += SEPARATOR_PENALTY;
        }
        if (!best || score < best.score) best = { score, cells };
      }
    }
  }
  return best;
}

// The EXP crop → { exp, pct, sure }, or null when there's no bracket or a digit is far off.
function readExpNumbers(img, scale, templateSet) {
  const best = decode(img, scale, templateSet);
  if (!best) return null;
  const digits = best.cells.filter((c) => c.kind === 'd');
  if (digits.some((c) => c.d > UNSURE_MAX_DISTANCE)) return null;
  const text = best.cells.map((c) => (c.kind === 'd' ? c.digit : c.kind)).join('');
  const m = /^([\d,]+)\[(\d{1,2})\.(\d{2})$/.exec(text);
  if (!m) return null;
  const sure = digits.every((c) => c.d <= MAX_DISTANCE && c.margin >= MIN_MARGIN);
  return { exp: Number(m[1].replace(/,/g, '')), pct: Number(`${m[2]}.${m[3]}`), sure };
}

// Template instances from crops whose text is known: { crop, scale, text: '30,146[74.41' }.
// The known text fixes the layout; it is aligned where the gaps between digits are darkest.
function buildTemplates(samples) {
  const digits = {};
  for (const { crop, scale, text } of samples) {
    const p = prepare(crop, scale);
    if (!p) throw new Error(`no bracket in the crop for ${text}`);
    const [exp, pct] = text.split('[');
    const kinds = [...exp].map((ch) => (/\d/.test(ch) ? 'd' : ch));
    const chars = [...exp, '[', ...pct];
    const all = [...kinds, '[', ...[...pct].map((ch) => (/\d/.test(ch) ? 'd' : ch))];
    let best = null;
    for (const start of bracketCellStarts(p, scale)) {
      const cells = place(all, start - advanceOf(kinds) * scale, scale, crop.width);
      if (!cells) continue;
      let ink = 0; // text pixels in the one-game-pixel gap after each digit
      for (const c of cells.filter((c) => c.kind === 'd'))
        for (let x = Math.ceil(c.x + GLYPH_WIDTH * scale); x < Math.floor(c.x + ADVANCE.d * scale); x++)
          for (let y = p.band.y0; y <= p.band.y1; y++) if (x >= 0 && x < p.width && p.L[y * p.width + x] >= p.t) ink++;
      if (!best || ink < best.ink) best = { ink, cells };
    }
    best.cells.forEach((c, i) => {
      if (c.kind !== 'd') return;
      const f = features(p, c.x, c.x + GLYPH_WIDTH * scale);
      (digits[chars[i]] = digits[chars[i]] || []).push(Array.from(f, (v) => Math.round(v * 1000) / 1000));
    });
  }
  return digits;
}

const scaleForGameHeight = (gameHeight) => gameHeight / NATIVE_HEIGHT;

module.exports = { readExpNumbers, decode, buildTemplates, scaleForGameHeight, luminanceGrid, textThreshold, findBracket, findBrackets, GRID_W, GRID_H };
