// Reads the game's EXP numbers ("30,146[74.41%]") by matching its pixel-font digits.
//
// MapleStory Classic draws at 768 pixels tall and the result is scaled up to the screen, so every
// character sits at a fixed spacing in the game's own pixels: digits advance 6, the comma 5, the
// bracket 6 and the dot 4. Rather than finding gaps between characters (blur makes neighbours
// touch), we try each possible layout of the number, cut every character at its exact position,
// and keep the layout whose digits match the templates best. A digit that isn't a clear match makes
// the whole reading null — no reading beats a wrong one.
//
// Templates (digit-templates.json) are cut from real captures with known text; every instance is
// kept, since each copy lands on the screen's pixels a little differently.

const GRID_W = 5; // one cell per game pixel of the 5-wide, 8-tall digits
const GRID_H = 8;
const NATIVE_HEIGHT = 768;
const ADVANCE = { d: 6, ',': 5, '[': 6, '.': 4 }; // in the game's own pixels
const GLYPH_WIDTH = 5; // a digit's drawn width, in the game's own pixels
const MAX_DISTANCE = 0.07; // mean per-cell difference allowed for a digit match
const MIN_MARGIN = 0.015; // the best digit must beat every other digit by this much
const SEPARATOR_PENALTY = 0.25;
const OFFSET_SEARCH = 6; // try the first character this many game pixels either side of the start

let templates = null;
const loadTemplates = () => templates || (templates = require('./digit-templates.json').digits);

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

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

// The rows the text occupies: the longest run of rows with any text pixel.
function textBand(L, width, height, t) {
  let best = null;
  let start = -1;
  for (let y = 0; y <= height; y++) {
    let any = false;
    if (y < height) for (let x = 0; x < width && !any; x++) any = L[y * width + x] >= t;
    if (any && start < 0) start = y;
    if (!any && start >= 0) {
      if (!best || y - start > best.y1 - best.y0 + 1) best = { y0: start, y1: y - 1 };
      start = -1;
    }
  }
  return best;
}

function firstTextColumn(L, width, band, t) {
  for (let x = 0; x < width; x++) for (let y = band.y0; y <= band.y1; y++) if (L[y * width + x] >= t) return x;
  return -1;
}

// Sample the area x0..x1 (may be fractional) × the text band into a GRID_W × GRID_H grid of 0..1.
function features(L, width, x0, x1, band, t) {
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

// Every way the text can be laid out: 1–10 EXP digits (thousands commas), then [, 1–2 digits, ., 2 digits.
const LAYOUTS = [];
for (let n = 1; n <= 10; n++)
  for (let m = 1; m <= 2; m++) {
    const exp = [];
    for (let i = 0; i < n; i++) {
      if (i > 0 && (n - i) % 3 === 0) exp.push(',');
      exp.push('d');
    }
    LAYOUTS.push([...exp, '[', ...Array(m).fill('d'), '.', 'd', 'd']);
  }

// Does a separator cell look right? Commas and dots sit low (top 60% dark); the bracket is a tall bar.
function separatorFits(L, width, x0, x1, band, t, kind) {
  const h = band.y1 - band.y0 + 1;
  if (kind === '[') {
    let tallest = 0;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (x < 0 || x >= width) continue;
      let n = 0;
      for (let y = band.y0; y <= band.y1; y++) if (L[y * width + x] >= t) n++;
      tallest = Math.max(tallest, n);
    }
    return tallest >= 0.6 * h;
  }
  let bright = 0;
  for (let y = band.y0; y < band.y0 + 0.6 * h; y++)
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) if (x >= 0 && x < width && L[Math.floor(y) * width + x] >= t) bright++;
  return bright <= 1;
}

// Decode the crop with `scale` screen pixels per game pixel: the best-fitting layout's cells.
function decode(img, scale, templateSet = loadTemplates()) {
  const L = luminanceGrid(img);
  const t = textThreshold(L);
  if (t === null) return null;
  const band = textBand(L, img.width, img.height, t);
  if (!band) return null;
  const first = firstTextColumn(L, img.width, band, t);
  if (first < 0) return null;

  const cache = new Map();
  const cell = (x) => {
    const key = x.toFixed(3); // exact: advances like 11.25 px don't sit on a half-pixel grid
    if (!cache.has(key)) cache.set(key, matchDigit(features(L, img.width, x, x + GLYPH_WIDTH * scale, band, t), templateSet));
    return cache.get(key);
  };

  let best = null;
  for (let offset = -OFFSET_SEARCH * scale; offset <= OFFSET_SEARCH * scale; offset += 0.5) {
    for (const layout of LAYOUTS) {
      let x = first + offset;
      let score = 0;
      let digits = 0;
      const cells = [];
      for (const kind of layout) {
        const x1 = x + ADVANCE[kind] * scale;
        if (x1 > img.width + scale) {
          score = Infinity;
          break;
        }
        if (kind === 'd') {
          const c = cell(x);
          cells.push({ kind, ...c });
          score += c.d;
          digits += 1;
        } else {
          cells.push({ kind });
          if (!separatorFits(L, img.width, x, x1, band, t, kind)) score += SEPARATOR_PENALTY;
        }
        x = x1;
      }
      if (!Number.isFinite(score)) continue;
      const mean = score / digits;
      if (!best || mean < best.mean) best = { mean, cells };
    }
  }
  return best;
}

// The EXP crop → { exp, pct }, or null unless every digit is a clear match.
function readExpNumbers(img, scale, templateSet) {
  const best = decode(img, scale, templateSet);
  if (!best) return null;
  if (best.cells.some((c) => c.kind === 'd' && (c.d > MAX_DISTANCE || c.margin < MIN_MARGIN))) return null;
  const text = best.cells.map((c) => (c.kind === 'd' ? c.digit : c.kind)).join('');
  const m = /^([\d,]+)\[(\d{1,2})\.(\d{2})$/.exec(text);
  return m ? { exp: Number(m[1].replace(/,/g, '')), pct: Number(`${m[2]}.${m[3]}`) } : null;
}

// Template instances from crops whose text is known: { crop, scale, text: '30,146[74.41' }.
// The known text fixes the layout; the start is aligned by where the separators fit.
function buildTemplates(samples) {
  const digits = {};
  for (const { crop, scale, text } of samples) {
    const L = luminanceGrid(crop);
    const t = textThreshold(L);
    const band = textBand(L, crop.width, crop.height, t);
    const first = firstTextColumn(L, crop.width, band, t);
    const layout = [...text].map((ch) => (/\d/.test(ch) ? 'd' : ch));
    let bestStart = first;
    let bestFits = -1;
    for (let offset = -OFFSET_SEARCH * scale; offset <= OFFSET_SEARCH * scale; offset += 0.5) {
      let x = first + offset;
      let fits = 0;
      for (const kind of layout) {
        const x1 = x + ADVANCE[kind] * scale;
        if (kind !== 'd' && separatorFits(L, crop.width, x, x1, band, t, kind)) fits++;
        x = x1;
      }
      if (fits > bestFits || (fits === bestFits && Math.abs(offset) < Math.abs(bestStart - first))) {
        bestFits = fits;
        bestStart = first + offset;
      }
    }
    let x = bestStart;
    layout.forEach((kind, i) => {
      if (kind === 'd') {
        const f = features(L, crop.width, x, x + GLYPH_WIDTH * scale, band, t);
        (digits[text[i]] = digits[text[i]] || []).push(Array.from(f, (v) => Math.round(v * 1000) / 1000));
      }
      x += ADVANCE[kind] * scale;
    });
  }
  return digits;
}

const scaleForGameHeight = (gameHeight) => gameHeight / NATIVE_HEIGHT;

module.exports = { readExpNumbers, decode, buildTemplates, scaleForGameHeight, luminanceGrid, textThreshold, GRID_W, GRID_H };
