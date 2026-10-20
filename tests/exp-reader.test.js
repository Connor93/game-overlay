const fs = require('fs');
const path = require('path');
const img = require('../src/main/exp/image');
const { createOcr } = require('../src/main/exp/ocr');
const { createReader } = require('../src/main/exp/reader');

// A 3440×1440 screen like the user's: the game pillarboxed 440 px in, with the live in-game
// status line and the minimap where they were.
function liveScreen() {
  const width = 3440;
  const height = 1440;
  const screen = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (let i = 3; i < screen.data.length; i += 4) screen.data[i] = 255;
  img.fillRect(screen, { x: 440, y: 0, width: 2560, height: 1440 }, 90); // the game area
  const paste = (file, x0, y0) => {
    const part = img.decodePng(fs.readFileSync(path.join(__dirname, 'fixtures/exp', file)));
    for (let y = 0; y < part.height; y++) screen.data.set(part.data.subarray(y * part.width * 4, (y + 1) * part.width * 4), ((y0 + y) * width + x0) * 4);
  };
  paste('ingame-status.png', 970, 1372);
  paste('minimap-100.png', 440, 0);
  return screen;
}

let ocr;
let reader;
beforeAll(() => {
  ocr = createOcr();
  reader = createReader(ocr);
});
afterAll(() => ocr.terminate());

test('finds and reads EXP and the map name on a pillarboxed live screen', async () => {
  const frame = liveScreen();
  const regions = await reader.locate(frame);
  expect(regions).not.toBeNull();
  expect(regions.scale).toBeCloseTo(1.875);
  expect(await reader.readExp(frame, regions)).toEqual({ exp: 30017, pct: 74.09 });
  expect(await reader.readMap(frame, regions)).toEqual({ street: 'Hidden Street', map: 'Over the Wall' });
}, 60000);

// The minimap name at smaller sizes (blurry shrinks of the screenshot).
for (const scale of [75, 50]) {
  test(`reads the map name at ${scale}% scale`, async () => {
    const part = img.decodePng(fs.readFileSync(path.join(__dirname, `fixtures/exp/minimap-${scale}.png`)));
    const f = scale / 100;
    const regions = { exp: null, map: { x: 88 * f, y: 50 * f, width: 170 * f, height: 58 * f }, textHeight: 17 * f };
    expect(await reader.readMap(part, regions)).toEqual({ street: 'Hidden Street', map: 'Over the Wall' });
  }, 60000);
}

test('a black screen has nothing to locate', async () => {
  const width = 400;
  const height = 300;
  const black = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  expect(await reader.locate(black)).toBeNull();
}, 60000);
