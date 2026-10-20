const fs = require('fs');
const path = require('path');
const img = require('../src/main/exp/image');
const { createOcr } = require('../src/main/exp/ocr');
const { createReader } = require('../src/main/exp/reader');

// Rebuild a (mostly black) screen at the given scale with the fixtures where they were on screen,
// so locating the EXP bar and minimap is exercised too.
const SCREEN = { width: 2559, height: 1440 };
const PLACES = { status: { x: 530, y: 1372 }, minimap: { x: 0, y: 0 } };
function screenAt(scale) {
  const f = scale / 100;
  const width = Math.round(SCREEN.width * f);
  const height = Math.round(SCREEN.height * f);
  const screen = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  // A plain mid-gray "game" behind the fixtures, so the whole screen is game area.
  screen.data.fill(90);
  for (let i = 3; i < screen.data.length; i += 4) screen.data[i] = 255;
  for (const [name, at] of Object.entries(PLACES)) {
    const part = img.decodePng(fs.readFileSync(path.join(__dirname, `fixtures/exp/${name}-${scale}.png`)));
    const x0 = Math.round(at.x * f);
    const y0 = Math.round(at.y * f);
    for (let y = 0; y < part.height && y0 + y < height; y++) {
      const row = part.data.subarray(y * part.width * 4, (y + 1) * part.width * 4);
      screen.data.set(row.subarray(0, Math.min(row.length, (width - x0) * 4)), ((y0 + y) * width + x0) * 4);
    }
  }
  return screen;
}

let ocr;
let reader;
beforeAll(() => {
  ocr = createOcr();
  reader = createReader(ocr);
});
afterAll(() => ocr.terminate());

async function read(scale) {
  const frame = screenAt(scale);
  const regions = await reader.locate(frame);
  if (!regions) return { regions, exp: null, map: null };
  return { regions, exp: await reader.readExp(frame, regions), map: await reader.readMap(frame, regions) };
}

test('reads EXP and the map name at 100% scale', async () => {
  const r = await read(100);
  expect(r.regions).not.toBeNull();
  expect(r.exp).toEqual({ exp: 27589, pct: 68.1 });
  expect(r.map).toEqual({ street: 'Hidden Street', map: 'Over the Wall' });
}, 60000);

// The smaller fixtures are blurry shrinks of the screenshot (harsher than a real lower-resolution
// screen). EXP must then read right or not at all — never wrong.
for (const scale of [75, 50]) {
  test(`at ${scale}% scale EXP is either right or unread, never wrong`, async () => {
    const frame = screenAt(scale);
    const f = scale / 100;
    const regions = { exp: { x: 1398 * f, y: 1378 * f, width: 160 * f, height: 28 * f }, map: null, textHeight: 17 * f };
    const exp = await reader.readExp(frame, regions);
    if (exp !== null) expect(exp).toEqual({ exp: 27589, pct: 68.1 });
  }, 60000);
}

for (const scale of [75, 50]) {
  test(`reads the map name at ${scale}% scale`, async () => {
    const frame = screenAt(scale);
    const f = scale / 100;
    const regions = { exp: null, map: { x: 88 * f, y: 50 * f, width: 170 * f, height: 58 * f }, textHeight: 17 * f };
    expect(await reader.readMap(frame, regions)).toEqual({ street: 'Hidden Street', map: 'Over the Wall' });
  }, 60000);
}

test('a black screen has nothing to locate', async () => {
  const width = 400;
  const height = 300;
  const black = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  expect(await reader.locate(black)).toBeNull();
}, 60000);
