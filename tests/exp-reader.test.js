const fs = require('fs');
const path = require('path');
const img = require('../src/main/exp/image');
const { createOcr } = require('../src/main/exp/ocr');
const { createReader } = require('../src/main/exp/reader');

// A screen with the game (1440 px tall) at `game`, the live in-game status line centred along its
// bottom and the minimap in its top-left corner, as they were on the user's screen.
function liveScreen({ width, height, game, chrome = 0 }) {
  const screen = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (let i = 3; i < screen.data.length; i += 4) screen.data[i] = 255;
  if (chrome) img.fillRect(screen, { x: 0, y: 0, width, height: chrome }, 110); // menu + title bar
  img.fillRect(screen, game, 90); // the game area
  const paste = (file, x0, y0) => {
    const part = img.decodePng(fs.readFileSync(path.join(__dirname, 'fixtures/exp', file)));
    for (let y = 0; y < part.height; y++) screen.data.set(part.data.subarray(y * part.width * 4, (y + 1) * part.width * 4), ((y0 + y) * width + x0) * 4);
  };
  paste('ingame-status.png', game.x + game.width / 2 - 750, game.y + 1372); // 750: its offset from the centre
  paste('minimap-100.png', game.x, game.y);
  return screen;
}

let ocr;
let reader;
beforeAll(() => {
  ocr = createOcr();
  reader = createReader(ocr);
});
afterAll(() => ocr.terminate());

// The user's big monitor: 3440×1440 with the game pillarboxed 440 px in.
test('finds and reads EXP and the map name on a pillarboxed live screen', async () => {
  const frame = liveScreen({ width: 3440, height: 1440, game: { x: 440, y: 0, width: 2560, height: 1440 } });
  const regions = await reader.locate(frame);
  expect(regions).not.toBeNull();
  expect(regions.scale).toBeCloseTo(1.875);
  expect(await reader.readExp(frame, regions)).toEqual({ exp: 30017, pct: 74.09, sure: true });
  expect(await reader.readMap(frame, regions)).toEqual({ street: 'Hidden Street', map: 'Over the Wall' });
}, 60000);

// Full screen on the user's laptop: the menu bar and window title bar stay, a black strip sits
// between them and the game, and the game is a little wider than 16:9 (its status bar centred).
test('finds and reads EXP and the map name under window chrome, in a wider game', async () => {
  const frame = liveScreen({ width: 2700, height: 1640, chrome: 80, game: { x: 10, y: 200, width: 2690, height: 1440 } });
  const regions = await reader.locate(frame);
  expect(regions).not.toBeNull();
  expect(regions.scale).toBeCloseTo(1.875);
  expect(await reader.readExp(frame, regions)).toEqual({ exp: 30017, pct: 74.09, sure: true });
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

// The minimap on the user's laptop (a 1890-pixel-tall game): the name starts close to the crop's
// edge, where the first letter used to get lost ("ver the Wall").
test('reads the map name on the laptop', async () => {
  const part = img.decodePng(fs.readFileSync(path.join(__dirname, 'fixtures/exp/minimap-laptop.png')));
  const u = 1890 / 1440;
  const regions = { exp: null, map: { x: 88 * u, y: 50 * u, width: 170 * u, height: 58 * u }, textHeight: 17 * u };
  expect(await reader.readMap(part, regions)).toEqual({ street: 'Hidden Street', map: 'Over the Wall' });
}, 60000);

test('a black screen has nothing to locate', async () => {
  const width = 400;
  const height = 300;
  const black = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  expect(await reader.locate(black)).toBeNull();
}, 60000);
