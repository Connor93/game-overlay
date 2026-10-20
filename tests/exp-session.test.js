const { createSessionMachine, UNKNOWN_MAP } = require('../src/shared/exp/session');

const S = 1000;
const MAP_A = { street: 'Hidden Street', map: 'Over the Wall' };
const MAP_B = { street: 'Victoria Road', map: 'Ant Tunnel I' };
const ok = (exp, pct = 50) => ({ status: 'ok', exp, pct, required: [40000, 40010] });
const levelup = (exp, pct, previousRequired) => ({ status: 'levelup', exp, pct, required: [50000, 50010], previousRequired });

function setup(opts = {}) {
  const saved = [];
  const m = createSessionMachine({ autoStart: true, onSave: (s) => saved.push(s), ...opts });
  return { m, saved };
}

// Feed one sample every 4 s from `from`, with exp from the list (null = unreadable), on `map`.
function feed(m, from, exps, map = MAP_A) {
  let t = from;
  for (const exp of exps) {
    m.sample({ t, verdict: exp === null ? null : ok(exp), map });
    m.tick(t);
    t += 4 * S;
  }
  return t;
}

test('a couple of kills while passing through never starts a session', () => {
  const { m } = setup();
  feed(m, 0, [1000, 1100, 1100, 1100, 1200, 1200, 1200, 1200]);
  expect(m.state().status).toBe('idle');
  expect(m.state().session).toBeNull();
});

test('steady gain auto-starts: 3 gains within 20 s', () => {
  const { m } = setup();
  feed(m, 0, [1000, 1100, 1200, 1300]);
  expect(m.state().status).toBe('tracking');
  expect(m.state().session.map).toBe('Over the Wall');
  expect(m.state().session.street).toBe('Hidden Street');
});

test('auto-start off: steady gain does not start', () => {
  const { m } = setup({ autoStart: false });
  feed(m, 0, [1000, 1100, 1200, 1300, 1400]);
  expect(m.state().status).toBe('idle');
});

test('Start starts immediately, even without gains', () => {
  const { m } = setup();
  feed(m, 0, [1000]);
  m.start(4 * S);
  expect(m.state().status).toBe('tracking');
  expect(m.state().session.gainedExp).toBe(0);
});

test('Stop saves (≥60 s) and disarms auto-start until a map change', () => {
  const { m, saved } = setup();
  let t = feed(m, 0, [1000, 1100, 1200, 1300]);
  t = feed(m, t, Array.from({ length: 20 }, (_, i) => 1400 + i * 100));
  m.stop(t);
  expect(saved).toHaveLength(1);
  expect(m.state().status).toBe('idle');
  expect(m.state().autoStartArmed).toBe(false);
  t = feed(m, t + 4 * S, [4000, 4100, 4200, 4300, 4400]);
  expect(m.state().status).toBe('idle');
  t = feed(m, t, [4400, 4400], MAP_B);
  expect(m.state().autoStartArmed).toBe(true);
  feed(m, t, [4500, 4600, 4700], MAP_B);
  expect(m.state().status).toBe('tracking');
  expect(m.state().session.map).toBe('Ant Tunnel I');
});

test('map change needs two consecutive reads and ends the session without starting one', () => {
  const { m, saved } = setup();
  let t = feed(m, 0, Array.from({ length: 25 }, (_, i) => 1000 + i * 100));
  expect(m.state().status).toBe('tracking');
  t = feed(m, t, [3500], MAP_B);
  expect(m.state().status).toBe('tracking');
  feed(m, t, [3500], MAP_B);
  expect(m.state().status).toBe('idle');
  expect(saved).toHaveLength(1);
  expect(saved[0].map).toBe('Over the Wall');
  expect(m.state().map.map).toBe('Ant Tunnel I');
});

test('a single misread map name does not end the session', () => {
  const { m } = setup();
  let t = feed(m, 0, [1000, 1100, 1200, 1300]);
  t = feed(m, t, [1400], { street: 'Hidden Street', map: 'Over the Wa11' });
  feed(m, t, [1500, 1600]);
  expect(m.state().status).toBe('tracking');
  expect(m.state().session.map).toBe('Over the Wall');
});

test('unreadable map name: session runs as Unknown map; first readable name just names it', () => {
  const { m } = setup();
  let t = feed(m, 0, [1000, 1100, 1200, 1300], null);
  expect(m.state().session.map).toBe(UNKNOWN_MAP);
  expect(m.state().needsMapName).toBe(true);
  feed(m, t, [1400], MAP_A);
  expect(m.state().status).toBe('tracking');
  expect(m.state().session.map).toBe('Over the Wall');
  expect(m.state().needsMapName).toBe(false);
});

test('an unreadable name mid-session keeps the known name', () => {
  const { m } = setup();
  const t = feed(m, 0, [1000, 1100, 1200, 1300]);
  feed(m, t, [1400, 1500, 1600], null);
  expect(m.state().session.map).toBe('Over the Wall');
});

test('nameMap renames the open session for the rest of it', () => {
  const { m } = setup();
  const t = feed(m, 0, [1000, 1100, 1200, 1300], null);
  m.nameMap('Slime Tree');
  feed(m, t, [1400, 1500], null);
  expect(m.state().session.map).toBe('Slime Tree');
  expect(m.state().needsMapName).toBe(false);
});

test('45 s without gain pauses, back-dated to the last gain; next gain resumes', () => {
  const { m } = setup();
  // Gains at 0..12 s; tracking from the 3rd gain at 8 s.
  let t = feed(m, 0, [1000, 1100, 1200, 1300]);
  const trainingAtLastGain = m.state().session.trainingMs; // 8 s → 12 s = 4 s
  t = feed(m, t, Array(12).fill(1300)); // 48 s with no gain
  expect(m.state().status).toBe('paused');
  expect(m.state().session.trainingMs).toBe(trainingAtLastGain);
  t = feed(m, t, [1300, 1300]);
  expect(m.state().session.trainingMs).toBe(trainingAtLastGain);
  feed(m, t, [1400, 1500]);
  expect(m.state().status).toBe('tracking');
  expect(m.state().session.trainingMs).toBe(trainingAtLastGain + 4 * S);
});

test('pause longer than 10 min ends and saves', () => {
  const { m, saved } = setup();
  let t = feed(m, 0, Array.from({ length: 25 }, (_, i) => 1000 + i * 100));
  t = feed(m, t, Array(12).fill(3400));
  expect(m.state().status).toBe('paused');
  m.tick(t + 11 * 60 * S);
  expect(m.state().status).toBe('idle');
  expect(saved).toHaveLength(1);
});

test('sessions under 60 s of training are discarded', () => {
  const { m, saved } = setup();
  const t = feed(m, 0, [1000, 1100, 1200, 1300, 1400]);
  m.stop(t);
  expect(saved).toHaveLength(0);
  expect(m.state().session).toBeNull();
});

test('death lowers gained EXP; quest jump adds', () => {
  const { m } = setup();
  let t = feed(m, 0, [1000, 1100, 1200, 1300]); // tracking from the 3rd gain: counts 1200→1300
  const before = m.state().session.gainedExp;
  t = feed(m, t, [900]);
  expect(m.state().session.gainedExp).toBe(before - 400);
  feed(m, t, [5900]);
  expect(m.state().session.gainedExp).toBe(before - 400 + 5000);
});

test('level-up carries gained EXP across levels', () => {
  const { m } = setup();
  const t = feed(m, 0, [40000, 40100, 40200, 40300]);
  const before = m.state().session.gainedExp;
  m.sample({ t, verdict: levelup(120, 0.24, [40500, 40510]), map: MAP_A });
  expect(m.state().session.gainedExp).toBe(before + (40505 - 40300) + 120);
  expect(m.state().session.levelUps).toBe(1);
});

test('quit saves an open session over 60 s', () => {
  const { m, saved } = setup();
  const t = feed(m, 0, Array.from({ length: 25 }, (_, i) => 1000 + i * 100));
  m.quit(t);
  expect(saved).toHaveLength(1);
  expect(saved[0].trainingMs).toBeGreaterThanOrEqual(60 * S);
  expect(saved[0].gains).toBeUndefined();
});

test('unreadable samples (null verdict) change nothing', () => {
  const { m } = setup();
  const t = feed(m, 0, [1000, 1100, 1200, 1300]);
  const gained = m.state().session.gainedExp;
  feed(m, t, [null, null]);
  expect(m.state().session.gainedExp).toBe(gained);
  expect(m.state().status).toBe('tracking');
});

test('rejected readings change nothing', () => {
  const { m } = setup();
  const t = feed(m, 0, [1000, 1100, 1200, 1300]);
  const gained = m.state().session.gainedExp;
  m.sample({ t, verdict: { status: 'reject', exp: 99999, pct: 50 }, map: MAP_A });
  expect(m.state().session.gainedExp).toBe(gained);
});
