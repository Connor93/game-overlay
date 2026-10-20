const { createValidator } = require('../src/shared/exp/validator');

test('consistent readings are ok', () => {
  const v = createValidator();
  expect(v.accept({ exp: 27589, pct: 68.1 }).status).toBe('ok');
  expect(v.accept({ exp: 27650, pct: 68.25 }).status).toBe('ok');
});
test('a one-digit misread is rejected', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  v.accept({ exp: 27650, pct: 68.25 });
  expect(v.accept({ exp: 27583, pct: 68.1 }).status).toBe('reject');
});
test('a level-up is recognised and resets the level', () => {
  const v = createValidator();
  v.accept({ exp: 40400, pct: 99.72 });
  expect(v.accept({ exp: 120, pct: 0.27 }).status).toBe('levelup');
  expect(v.accept({ exp: 300, pct: 0.68 }).status).toBe('ok');
});
test('a level-up verdict carries the previous level requirement', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  const verdict = v.accept({ exp: 120, pct: 0.27 });
  expect(verdict.previousRequired[0]).toBeGreaterThan(40509);
  expect(verdict.previousRequired[1]).toBeLessThan(40516);
});
test('a real death drop is accepted (same level, consistent)', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  expect(v.accept({ exp: 23538, pct: 58.1 }).status).toBe('ok');
});
// Recovery means what we knew was wrong, so the jump to the new values is not a gain or a loss.
test('validator rebases after 3 agreeing rejects', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  expect(v.accept({ exp: 30000, pct: 60.0 }).status).toBe('reject');
  expect(v.accept({ exp: 30050, pct: 60.1 }).status).toBe('reject');
  expect(v.accept({ exp: 30100, pct: 60.2 }).status).toBe('rebase');
  expect(v.accept({ exp: 30150, pct: 60.3 }).status).toBe('ok');
});
test('rejects that disagree with each other do not reset', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  v.accept({ exp: 30000, pct: 60.0 });
  v.accept({ exp: 11111, pct: 60.0 });
  expect(v.accept({ exp: 22222, pct: 60.0 }).status).toBe('reject');
  expect(v.accept({ exp: 27600, pct: 68.13 }).status).toBe('ok');
});
test('ok verdicts report the required-EXP interval', () => {
  const r = createValidator().accept({ exp: 27589, pct: 68.1 }).required;
  expect(r[0]).toBeCloseTo(40509.5, 0);
  expect(r[1]).toBeCloseTo(40515.4, 0);
});
test('a misread percentage alone never fakes a level-up', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  expect(v.accept({ exp: 27589, pct: 8.1 }).status).toBe('reject');
});

// Readings the digit reader isn't sure of (sure: false) can only confirm what is already known.
test('an unsure first reading is not trusted', () => {
  const v = createValidator();
  expect(v.accept({ exp: 27589, pct: 68.1, sure: false }).status).toBe('reject');
  expect(v.accept({ exp: 27589, pct: 68.1, sure: true }).status).toBe('ok');
});
test('an unsure reading that agrees with the level is ok', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1, sure: true });
  expect(v.accept({ exp: 27650, pct: 68.25, sure: false }).status).toBe('ok');
});
test('unsure readings that disagree are rejected and never reset the level', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1, sure: true });
  for (let i = 0; i < 5; i++) expect(v.accept({ exp: 27089 + i, pct: 68.1, sure: false }).status).toBe('reject');
  expect(v.accept({ exp: 27650, pct: 68.25, sure: true }).status).toBe('ok');
});
test('an unsure reading never counts as a level-up', () => {
  const v = createValidator();
  v.accept({ exp: 40400, pct: 99.72, sure: true });
  expect(v.accept({ exp: 120, pct: 0.27, sure: false }).status).toBe('reject');
});

// Level-ups: lower EXP that only fits a bigger requirement than the current level's.
test('a level-up from below 50% is recognised', () => {
  const v = createValidator();
  v.accept({ exp: 16204, pct: 40.0, sure: true }); // required ≈ 40510
  expect(v.accept({ exp: 9000, pct: 20.0, sure: true }).status).toBe('levelup'); // required ≈ 45000
});
test('lower EXP and percentage on a smaller requirement is not a level-up', () => {
  // e.g. switching to a lower-level character, or a misread dropping leading digits of both
  const v = createValidator();
  v.accept({ exp: 34447, pct: 85.03, sure: true }); // required ≈ 40511
  expect(v.accept({ exp: 3444, pct: 15.03, sure: true }).status).toBe('reject'); // required ≈ 22914
});
test('higher EXP on a bigger requirement is not a level-up', () => {
  const v = createValidator();
  v.accept({ exp: 34447, pct: 85.03, sure: true });
  expect(v.accept({ exp: 44447, pct: 85.03, sure: true }).status).toBe('reject');
});

// An unsure reading a few EXP off the last trusted one (inside the rounding slack) is noise: it
// mustn't move the numbers, or an idle player's flickering reading would count as gains.
test('an unsure reading within the slack of the last trusted one keeps the trusted values', () => {
  const v = createValidator();
  v.accept({ exp: 35296, pct: 87.12, sure: true });
  const verdict = v.accept({ exp: 35298, pct: 87.13, sure: false });
  expect(verdict.status).toBe('ok');
  expect(verdict).toMatchObject({ exp: 35296, pct: 87.12 });
  expect(v.accept({ exp: 35296, pct: 87.12, sure: true })).toMatchObject({ status: 'ok', exp: 35296 });
});
test('an unsure reading of a real gain moves the numbers', () => {
  const v = createValidator();
  v.accept({ exp: 35296, pct: 87.12, sure: true });
  expect(v.accept({ exp: 35411, pct: 87.41, sure: false })).toMatchObject({ status: 'ok', exp: 35411, pct: 87.41 });
});
