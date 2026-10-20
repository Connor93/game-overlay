// Reads the game's EXP numbers by matching its pixel-font digits against templates cut from a real
// screenshot (digit-templates.json). This is an independent second opinion to OCR: the reader only
// trusts a reading both agree on (see reader.js). A character that matches no digit closely
// enough makes the whole reading null.

const GRID_W = 8;
const GRID_H = 12;
const MAX_DISTANCE = 0.2; // mean per-cell difference allowed for a digit match

let templates = null;
const loadTemplates = () => templates || (templates = require('./digit-templates.json'));

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

// Split the crop into characters at empty columns. Returns boxes in crop coordinates.
function segment(img) {
  const L = luminanceGrid(img);
  const t = textThreshold(L);
  if (t === null) return [];
  const on = (x, y) => L[y * img.width + x] >= t;
  const pieces = [];
  let start = -1;
  for (let x = 0; x <= img.width; x++) {
    let any = false;
    if (x < img.width) for (let y = 0; y < img.height && !any; y++) any = on(x, y);
    if (any && start < 0) start = x;
    if (!any && start >= 0) {
      let y0 = img.height;
      let y1 = -1;
      for (let cx = start; cx < x; cx++)
        for (let y = 0; y < img.height; y++)
          if (on(cx, y)) {
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      pieces.push({ x0: start, x1: x - 1, y0, y1 });
      start = -1;
    }
  }
  return pieces;
}

// Sample a character into a GRID_W × GRID_H grid of 0..1 brightness, over the full text line height
// (so vertical position counts) and the character's own width.
function features(L, width, piece, line, t) {
  const out = new Float32Array(GRID_W * GRID_H);
  const w = piece.x1 - piece.x0 + 1;
  const h = line.y1 - line.y0 + 1;
  for (let gy = 0; gy < GRID_H; gy++)
    for (let gx = 0; gx < GRID_W; gx++) {
      const xa = piece.x0 + (gx * w) / GRID_W;
      const xb = piece.x0 + ((gx + 1) * w) / GRID_W;
      const ya = line.y0 + (gy * h) / GRID_H;
      const yb = line.y0 + ((gy + 1) * h) / GRID_H;
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(ya); y < Math.max(Math.ceil(yb), Math.floor(ya) + 1); y++)
        for (let x = Math.floor(xa); x < Math.max(Math.ceil(xb), Math.floor(xa) + 1); x++) {
          sum += Math.min(1, Math.max(0, (L[y * width + x] - t * 0.6) / (t * 0.8)));
          n++;
        }
      out[gy * GRID_W + gx] = n ? sum / n : 0;
    }
  return out;
}

function classifyDigit(feat) {
  const scored = Object.entries(loadTemplates().digits)
    .map(([digit, tpl]) => ({ digit, d: feat.reduce((s, v, i) => s + Math.abs(v - tpl[i]), 0) / feat.length }))
    .sort((a, b) => a.d - b.d);
  return scored[0].d <= MAX_DISTANCE ? scored[0].digit : null;
}

// Turn the crop into a token string: digits, '.' for comma/dot, '[' for thin full-height marks
// (brackets, the slash in HP/MP), '?' for anything else.
function tokens(img) {
  const pieces = segment(img);
  if (pieces.length === 0) return null;
  const L = luminanceGrid(img);
  const t = textThreshold(L);
  const lineHeight = Math.max(...pieces.map((p) => p.y1 - p.y0 + 1));
  const tall = pieces.filter((p) => p.y1 - p.y0 + 1 >= 0.7 * lineHeight);
  const line = { y0: Math.min(...tall.map((p) => p.y0)), y1: Math.max(...tall.map((p) => p.y1)) };
  return pieces
    .map((p) => {
      const w = p.x1 - p.x0 + 1;
      const h = p.y1 - p.y0 + 1;
      if (h < 0.4 * lineHeight && p.y0 > line.y0 + 0.5 * lineHeight) return '.';
      if (w <= 0.2 * lineHeight && h >= 0.7 * lineHeight) return '[';
      return classifyDigit(features(L, img.width, p, line, t)) ?? '?';
    })
    .join('');
}

const EXP_TOKENS = /^(\d{1,3}(?:\.\d{3})*)\[(\d{1,2})\.(\d{2})/;

// The EXP crop → { exp, pct }, or null unless every character before the % is certain.
function readExpNumbers(img) {
  const text = tokens(img);
  const m = text && EXP_TOKENS.exec(text);
  if (!m) return null;
  return { exp: Number(m[1].replace(/\./g, '')), pct: Number(`${m[2]}.${m[3]}`) };
}

module.exports = { readExpNumbers, segment, tokens, features, luminanceGrid, textThreshold, GRID_W, GRID_H };
