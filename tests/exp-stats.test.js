const { sessionStats, summarizeHistory } = require('../src/shared/exp/stats');

const MIN = 60 * 1000;
const base = { trainingMs: 30 * MIN, gainedExp: 25000, startedAt: 0, gains: [] };

test('EXP per hour over training time', () =>
  expect(sessionStats(base, { now: 30 * MIN, exp: 10000, pct: 25, required: [40000, 40000] }).expPerHour).toBe(50000));

test('no rate under 10 s of training', () =>
  expect(sessionStats({ ...base, trainingMs: 5000, gainedExp: 300 }, { now: 5000, exp: 1, pct: 1, required: null }).expPerHour).toBe(0));

test('last 5 minutes only counts recent gains, scaled to an hour', () => {
  const gains = [{ t: 20 * MIN, exp: 9999 }, { t: 26 * MIN, exp: 3000 }, { t: 29 * MIN, exp: 2000 }];
  expect(sessionStats({ ...base, gains }, { now: 30 * MIN, exp: 1, pct: 1, required: null }).last5mPerHour).toBe(60000);
});

test('time to level uses the recent rate once there are 5 minutes, else the overall rate', () => {
  const gains = [{ t: 26 * MIN, exp: 5000 }]; // 60,000/h recently
  const s = sessionStats({ ...base, gains }, { now: 30 * MIN, exp: 30000, pct: 75, required: [40000, 40000] });
  expect(s.timeToLevelMs).toBe(10 * MIN); // 10,000 left at 60,000/h
  const early = sessionStats({ ...base, startedAt: 27 * MIN, trainingMs: 3 * MIN, gainedExp: 2500, gains }, { now: 30 * MIN, exp: 30000, pct: 75, required: [40000, 40000] });
  expect(early.timeToLevelMs).toBe(12 * MIN); // 50,000/h overall
});

test('time to level is null without a rate or requirement', () => {
  expect(sessionStats({ ...base, gainedExp: 0 }, { now: 30 * MIN, exp: 1, pct: 1, required: [40000, 40000] }).timeToLevelMs).toBeNull();
  expect(sessionStats(base, { now: 30 * MIN, exp: 1, pct: 1, required: null }).timeToLevelMs).toBeNull();
});

test('% of level per hour', () =>
  expect(sessionStats(base, { now: 30 * MIN, exp: 10000, pct: 25, required: [40000, 40000] }).pctPerHour).toBeCloseTo(125, 5));

test('summarizeHistory picks the best session per map and sorts by it', () => {
  const sessions = [
    { id: 'a', map: 'Over the Wall', trainingMs: 60 * MIN, gainedExp: 40000, startLevelPct: 10, endLevelPct: 90, levelUps: 0, level: null },
    { id: 'b', map: 'Over the Wall', trainingMs: 30 * MIN, gainedExp: 30000, startLevelPct: 10, endLevelPct: 80, levelUps: 1 },
    { id: 'c', map: 'Ant Tunnel I', trainingMs: 60 * MIN, gainedExp: 50000, startLevelPct: 1, endLevelPct: 2, levelUps: 0 },
  ];
  expect(summarizeHistory(sessions)).toEqual([
    { map: 'Over the Wall', count: 2, best: { sessionId: 'b', expPerHour: 60000 } },
    { map: 'Ant Tunnel I', count: 1, best: { sessionId: 'c', expPerHour: 50000 } },
  ]);
});

test('last 5 minutes in a shorter session uses the time actually covered', () => {
  const session = { trainingMs: 2 * MIN, gainedExp: 2000, startedAt: 28 * MIN, gains: [{ t: 29 * MIN, exp: 1000 }, { t: 30 * MIN, exp: 1000 }] };
  expect(sessionStats(session, { now: 30 * MIN, exp: 1, pct: 1, required: null }).last5mPerHour).toBe(60000);
});
