const fs = require('fs');
const path = require('path');
const img = require('../src/main/exp/image');
const { readExpNumbers, segment } = require('../src/main/exp/digits');

const fixture = (scale) => img.decodePng(fs.readFileSync(path.join(__dirname, `fixtures/exp/status-${scale}.png`)));
// The numbers after "EXP", relative to the status-bar fixture at 100%.
const EXP_RECT = { x: 868, y: 6, width: 160, height: 28 };
const at = (scale) => {
  const f = scale / 100;
  return img.crop(fixture(scale), { x: EXP_RECT.x * f, y: EXP_RECT.y * f, width: EXP_RECT.width * f, height: EXP_RECT.height * f });
};

test('splits the EXP text into one piece per character', () => {
  // 2 7 , 5 8 9 [ 6 8 . 1 0 % (3 pieces) ]
  expect(segment(at(100)).length).toBe(16);
});

test('reads the EXP numbers at 100%', () => expect(readExpNumbers(at(100))).toEqual({ exp: 27589, pct: 68.1 }));

test('a blank crop reads as null', () => {
  const blank = { width: 50, height: 20, data: new Uint8ClampedArray(50 * 20 * 4).fill(40) };
  expect(readExpNumbers(blank)).toBeNull();
});
