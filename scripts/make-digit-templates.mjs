// One-off: build the EXP digit templates from the 100% status-bar fixture, where the text is
// known: HP [941/941], MP [431/431], EXP 27,589 [68.10%] — every digit 0–9 appears.
//   node scripts/make-digit-templates.mjs
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const img = require('../src/main/exp/image.js');
const { segment, features, luminanceGrid, textThreshold } = require('../src/main/exp/digits.js');

const here = path.dirname(new URL(import.meta.url).pathname);
const status = img.decodePng(fs.readFileSync(path.join(here, '../tests/fixtures/exp/status-100.png')));
// Each area and the characters its pieces spell, in order ('-' = skip that piece).
const AREAS = [
  { rect: { x: 445, y: 6, width: 90, height: 28 }, chars: '941--941-' }, // HP: 941 / 941 ] (the slash is 2 pieces)
  { rect: { x: 653, y: 6, width: 90, height: 28 }, chars: '431--431-' }, // MP
  { rect: { x: 868, y: 6, width: 160, height: 28 }, chars: '27-589-68-10----' }, // EXP: 27,589[68.10%]
];

const sums = {};
for (const { rect, chars } of AREAS) {
  const crop = img.crop(status, rect);
  const pieces = segment(crop);
  if (pieces.length !== chars.length) throw new Error(`expected ${chars.length} pieces in ${JSON.stringify(rect)}, got ${pieces.length}`);
  const L = luminanceGrid(crop);
  const t = textThreshold(L);
  const lineHeight = Math.max(...pieces.map((p) => p.y1 - p.y0 + 1));
  const tall = pieces.filter((p) => p.y1 - p.y0 + 1 >= 0.7 * lineHeight);
  const line = { y0: Math.min(...tall.map((p) => p.y0)), y1: Math.max(...tall.map((p) => p.y1)) };
  pieces.forEach((p, i) => {
    const c = chars[i];
    if (!/\d/.test(c)) return;
    const f = features(L, crop.width, p, line, t);
    sums[c] = sums[c] || { n: 0, v: new Float64Array(f.length) };
    sums[c].n++;
    f.forEach((v, j) => (sums[c].v[j] += v));
  });
}
const digits = Object.fromEntries(
  Object.entries(sums)
    .sort()
    .map(([c, { n, v }]) => [c, Array.from(v, (x) => Math.round((x / n) * 1000) / 1000)]),
);
if (Object.keys(digits).length !== 10) throw new Error(`missing digits: have ${Object.keys(digits).join('')}`);
fs.writeFileSync(path.join(here, '../src/main/exp/digit-templates.json'), JSON.stringify({ source: 'status-100.png', digits }) + '\n');
console.log('templates for', Object.keys(digits).join(''));
