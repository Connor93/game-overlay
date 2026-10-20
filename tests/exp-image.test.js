const img = require('../src/main/exp/image');

// width×height image filled by fn(x, y) → [r, g, b]
function make(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
const px = (im, x, y) => [...im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4)];

test('crop takes the requested rectangle', () => {
  const a = make(4, 4, (x, y) => [x * 10, y * 10, 0]);
  const c = img.crop(a, { x: 1, y: 2, width: 2, height: 1 });
  expect([c.width, c.height]).toEqual([2, 1]);
  expect(px(c, 0, 0)).toEqual([10, 20, 0, 255]);
  expect(px(c, 1, 0)).toEqual([20, 20, 0, 255]);
});

test('crop clamps to the image', () => {
  const c = img.crop(make(4, 4, () => [0, 0, 0]), { x: 2, y: 2, width: 10, height: 10 });
  expect([c.width, c.height]).toEqual([2, 2]);
});

test('gray, invert and threshold', () => {
  const a = make(2, 1, (x) => (x === 0 ? [200, 200, 200] : [20, 20, 20]));
  const t = img.threshold(img.invert(img.toGray(a)), 110);
  expect(px(t, 0, 0)).toEqual([0, 0, 0, 255]); // bright text → black after invert
  expect(px(t, 1, 0)).toEqual([255, 255, 255, 255]);
});

test('scaleNearest repeats pixels', () => {
  const s = img.scaleNearest(make(2, 1, (x) => [x * 100, 0, 0]), 3);
  expect([s.width, s.height]).toEqual([6, 3]);
  expect(px(s, 2, 2)).toEqual([0, 0, 0, 255]);
  expect(px(s, 3, 0)).toEqual([100, 0, 0, 255]);
});

test('scaleBox averages pixels when shrinking', () => {
  const s = img.scaleBox(make(2, 2, (x, y) => ((x + y) % 2 ? [200, 200, 200] : [0, 0, 0])), 0.5);
  expect([s.width, s.height]).toEqual([1, 1]);
  expect(px(s, 0, 0)).toEqual([100, 100, 100, 255]);
});

test('pad adds a white border', () => {
  const p = img.pad(make(1, 1, () => [0, 0, 0]), 2);
  expect([p.width, p.height]).toEqual([5, 5]);
  expect(px(p, 0, 0)).toEqual([255, 255, 255, 255]);
  expect(px(p, 2, 2)).toEqual([0, 0, 0, 255]);
});

test('PNG encode/decode round-trips', () => {
  const a = make(7, 5, (x, y) => [x * 30, y * 50, (x * y) % 256]);
  const b = img.decodePng(img.encodePng(a));
  expect([b.width, b.height]).toEqual([7, 5]);
  expect([...b.data]).toEqual([...a.data]);
});

test('findGameBounds ignores black bars around the game', () => {
  const a = make(100, 50, (x, y) => (x >= 20 && x < 80 && y >= 5 ? [120, 140, 160] : [0, 0, 0]));
  expect(img.findGameBounds(a)).toEqual({ x: 20, y: 5, width: 60, height: 45 });
});

test('findGameBounds on an all-black frame is null', () =>
  expect(img.findGameBounds(make(10, 10, () => [0, 0, 0]))).toBeNull());

test('fillRect blanks a region (clamped to the image)', () => {
  const a = make(4, 4, () => [200, 200, 200]);
  img.fillRect(a, { x: 2, y: 2, width: 10, height: 10 });
  expect(px(a, 1, 1)).toEqual([200, 200, 200, 255]);
  expect(px(a, 3, 3)).toEqual([0, 0, 0, 255]);
});

test('findGameBounds ignores overlays once they are blanked out', () => {
  const a = make(100, 50, (x, y) => (x >= 20 && x < 80 ? [120, 140, 160] : x >= 85 && y < 20 ? [255, 255, 255] : [0, 0, 0]));
  expect(img.findGameBounds(a).width).toBe(80); // the overlay in the right bar widens it (20..99)…
  img.fillRect(a, { x: 85, y: 0, width: 15, height: 20 });
  expect(img.findGameBounds(a)).toEqual({ x: 20, y: 0, width: 60, height: 50 }); // …until blanked
});
