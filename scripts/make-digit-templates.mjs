// One-off: build the EXP digit templates from live in-game EXP crops whose text is known
// (tests/fixtures/exp/<source>-exp-<exp>_<thousands>_<pct>_<decimals>.png). Every instance is kept.
// Sources: ingame (a 1440-pixel-tall game) and laptop (1890 pixels tall).
//   node scripts/make-digit-templates.mjs
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const img = require('../src/main/exp/image.js');
const { buildTemplates } = require('../src/main/exp/digits.js');

const here = path.dirname(new URL(import.meta.url).pathname);
const dir = path.join(here, '../tests/fixtures/exp');
const SCALES = { ingame: 1440 / 768, laptop: 1890 / 768 };
const samples = fs
  .readdirSync(dir)
  .map((f) => /^(ingame|laptop)-exp-(\d+)_(\d+)_(\d+)_(\d+)\.png$/.exec(f))
  .filter(Boolean)
  .map(([f, source, a, b, c, d]) => ({ file: f, crop: img.decodePng(fs.readFileSync(path.join(dir, f))), scale: SCALES[source], text: `${a},${b}[${c}.${d}` }));
const digits = buildTemplates(samples);
// Digits no live capture has shown yet come from the user's screenshot (a different, sharper
// source, so they match loosely and mostly read as "unsure" — safe, just less frequent).
const screenshot = buildTemplates([
  {
    crop: img.crop(img.decodePng(fs.readFileSync(path.join(dir, 'status-100.png'))), { x: 868, y: 6, width: 160, height: 28 }),
    scale: 1440 / 768,
    text: '27,589[68.10',
  },
]);
for (const [d, list] of Object.entries(screenshot)) if (!digits[d]) digits[d] = list;
const sorted = Object.fromEntries(Object.entries(digits).sort());
if (Object.keys(sorted).length !== 10) throw new Error(`missing digits: have ${Object.keys(sorted).join('')}`);
fs.writeFileSync(path.join(here, '../src/main/exp/digit-templates.json'), JSON.stringify({ sources: samples.map((s) => s.file), digits: sorted }) + '\n');
console.log(Object.entries(sorted).map(([d, l]) => `${d}×${l.length}`).join(' '));
