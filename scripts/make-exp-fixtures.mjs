// One-off: cut EXP-tracker test fixtures from a full-screen MapleStory screenshot (2559×1440).
// Only the status-bar line and the minimap are kept (no chat). Usage:
//   node scripts/make-exp-fixtures.mjs <screenshot.png>
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const img = require('../src/main/exp/image.js');

const REGIONS = {
  status: { x: 530, y: 1372, width: 1060, height: 40 },
  minimap: { x: 0, y: 0, width: 300, height: 120 },
};
const SCALES = [100, 75, 50];

const source = img.decodePng(fs.readFileSync(process.argv[2]));
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../tests/fixtures/exp');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, rect] of Object.entries(REGIONS)) {
  for (const scale of SCALES) {
    // Shrink the cut region the way a lower screen resolution would.
    const f = scale / 100;
    const cut = img.crop(source, rect);
    const out = scale === 100 ? cut : img.scaleBox(cut, f);
    fs.writeFileSync(path.join(outDir, `${name}-${scale}.png`), img.encodePng(out));
  }
}
console.log('fixtures written to', outDir);
