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
test('validator recovers after 3 agreeing rejects', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  expect(v.accept({ exp: 30000, pct: 60.0 }).status).toBe('reject');
  expect(v.accept({ exp: 30050, pct: 60.1 }).status).toBe('reject');
  expect(v.accept({ exp: 30100, pct: 60.2 }).status).toBe('ok');
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
