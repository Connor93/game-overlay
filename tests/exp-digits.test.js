const fs = require('fs');
const path = require('path');
const img = require('../src/main/exp/image');
const { readExpNumbers, buildTemplates } = require('../src/main/exp/digits');

const dir = path.join(__dirname, 'fixtures/exp');
const SCALE = 1440 / 768;
// Live in-game EXP crops, named by their text: ingame-exp-30_146_74_41.png = "30,146[74.41%]".
// ingame-: a 1440-pixel-tall game (big monitor). laptop-: a 1890-pixel-tall game in a window on a
// laptop, cropped wider so the end of the "EXP." label is in the crop too.
const SCALES = { ingame: SCALE, laptop: 1890 / 768 };
const load = (prefix) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${prefix}-exp-`))
    .map((f) => {
      const [, a, b, c, d] = /-exp-(\d+)_(\d+)_(\d+)_(\d+)\.png/.exec(f);
      return { crop: img.decodePng(fs.readFileSync(path.join(dir, f))), scale: SCALES[prefix], text: `${a},${b}[${c}.${d}`, truth: { exp: Number(a + b), pct: Number(`${c}.${d}`) } };
    });
const big = load('ingame');
const laptop = load('laptop');
const live = [...big, ...laptop];

test('reads every live in-game crop exactly, and is sure of it', () => {
  for (const s of live) expect(readExpNumbers(s.crop, s.scale)).toEqual({ ...s.truth, sure: true });
});

// The honest test: read each crop with templates built only from the others.
test('on unseen crops a sure reading is never wrong, and most are read', () => {
  let sure = 0;
  for (const s of live) {
    const r = readExpNumbers(s.crop, s.scale, buildTemplates(live.filter((o) => o !== s)));
    if (r && r.sure) {
      expect(r).toEqual({ ...s.truth, sure: true });
      sure += 1;
    }
  }
  expect(sure).toBeGreaterThanOrEqual(Math.ceil((live.length * 2) / 3));
});

// A new screen size: templates from the big monitor only. The digits are blurred differently, so
// it may be unsure, but its best reading is still right.
test('at a screen size it has no templates for, its best reading is still right', () => {
  const templates = buildTemplates(big);
  for (const s of laptop) expect(readExpNumbers(s.crop, s.scale, templates)).toMatchObject(s.truth);
});

test('the "EXP." label in the crop is not read as digits', () => {
  for (const s of laptop) expect(readExpNumbers(s.crop, s.scale).exp).toBe(s.truth.exp);
});

test('without the green bracket there is no reading', () => {
  const s = big[0];
  const grey = img.toGray(s.crop); // same text, but the bracket is no longer green
  expect(readExpNumbers(grey, s.scale)).toBeNull();
});

// The user's screenshot (sharper than live capture) and blurry shrinks of it: right or null.
const shot = img.decodePng(fs.readFileSync(path.join(dir, 'status-100.png')));
for (const scale of [100, 75, 50]) {
  test(`screenshot at ${scale}%: right or null, never wrong`, () => {
    const f = scale / 100;
    const src = scale === 100 ? shot : img.decodePng(fs.readFileSync(path.join(dir, `status-${scale}.png`)));
    const r = readExpNumbers(img.crop(src, { x: 868 * f, y: 6 * f, width: 160 * f, height: 28 * f }), SCALE * f);
    if (r !== null) expect(r).toMatchObject({ exp: 27589, pct: 68.1 });
  });
}

test('a blank crop reads as null', () => {
  const blank = { width: 50, height: 20, data: new Uint8ClampedArray(50 * 20 * 4).fill(40) };
  expect(readExpNumbers(blank, SCALE)).toBeNull();
});
