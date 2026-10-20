const fs = require('fs');
const path = require('path');
const img = require('../src/main/exp/image');
const { readExpNumbers, buildTemplates } = require('../src/main/exp/digits');

const dir = path.join(__dirname, 'fixtures/exp');
const SCALE = 1440 / 768;
// Live in-game EXP crops, named by their text: ingame-exp-30_146_74_41.png = "30,146[74.41%]".
const live = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('ingame-exp-'))
  .map((f) => {
    const [, a, b, c, d] = /ingame-exp-(\d+)_(\d+)_(\d+)_(\d+)\.png/.exec(f);
    return { crop: img.decodePng(fs.readFileSync(path.join(dir, f))), scale: SCALE, text: `${a},${b}[${c}.${d}`, truth: { exp: Number(a + b), pct: Number(`${c}.${d}`) } };
  });

test('reads every live in-game crop exactly', () => {
  for (const s of live) expect(readExpNumbers(s.crop, s.scale)).toEqual(s.truth);
});

// The honest test: read each crop with templates built only from the others.
test('on unseen crops it is never wrong, and reads at least some', () => {
  let right = 0;
  for (const s of live) {
    const r = readExpNumbers(s.crop, s.scale, buildTemplates(live.filter((o) => o !== s)));
    if (r !== null) {
      expect(r).toEqual(s.truth);
      right += 1;
    }
  }
  expect(right).toBeGreaterThanOrEqual(3);
});

// The user's screenshot (sharper than live capture) and blurry shrinks of it: right or null.
const shot = img.decodePng(fs.readFileSync(path.join(dir, 'status-100.png')));
for (const scale of [100, 75, 50]) {
  test(`screenshot at ${scale}%: right or null, never wrong`, () => {
    const f = scale / 100;
    const src = scale === 100 ? shot : img.decodePng(fs.readFileSync(path.join(dir, `status-${scale}.png`)));
    const r = readExpNumbers(img.crop(src, { x: 868 * f, y: 6 * f, width: 160 * f, height: 28 * f }), SCALE * f);
    if (r !== null) expect(r).toEqual({ exp: 27589, pct: 68.1 });
  });
}

test('a blank crop reads as null', () => {
  const blank = { width: 50, height: 20, data: new Uint8ClampedArray(50 * 20 * 4).fill(40) };
  expect(readExpNumbers(blank, SCALE)).toBeNull();
});
