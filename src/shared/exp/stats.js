// Numbers shown for a session, and the per-map summary for History.

const HOUR = 3600 * 1000;
const RECENT_MS = 5 * 60 * 1000;
const MIN_TRAINING_FOR_RATE_MS = 10 * 1000;

const midpoint = ([lo, hi]) => (Number.isFinite(hi) ? (lo + hi) / 2 : lo);
const perHour = (exp, ms) => (ms >= MIN_TRAINING_FOR_RATE_MS ? Math.round((exp / ms) * HOUR) : 0);

function sessionStats(session, { now, exp, required }) {
  const expPerHour = perHour(session.gainedExp, session.trainingMs);
  const recent = (session.gains || []).filter((g) => now - g.t <= RECENT_MS).reduce((sum, g) => sum + g.exp, 0);
  // A session younger than 5 minutes only covers its own length.
  const window = Math.min(RECENT_MS, Math.max(now - session.startedAt, MIN_TRAINING_FOR_RATE_MS));
  const last5mPerHour = Math.round((recent / window) * HOUR);
  // The last 5 minutes say more about "right now", once there are 5 minutes to look at.
  const rate = now - session.startedAt >= RECENT_MS ? last5mPerHour : expPerHour;
  const needed = required ? midpoint(required) : null;
  const timeToLevelMs = needed !== null && rate > 0 && exp !== null ? Math.max(0, Math.round(((needed - exp) / rate) * HOUR)) : null;
  const pctPerHour = needed ? (expPerHour / needed) * 100 : null;
  return { expPerHour, last5mPerHour, pctPerHour, timeToLevelMs, durationMs: session.trainingMs };
}

// One row per map: its best session by EXP per hour, best maps first.
function summarizeHistory(sessions) {
  const byMap = new Map();
  for (const s of sessions) {
    const rate = perHour(s.gainedExp, s.trainingMs);
    const row = byMap.get(s.map) || { map: s.map, count: 0, best: null };
    row.count += 1;
    if (!row.best || rate > row.best.expPerHour) row.best = { sessionId: s.id, expPerHour: rate };
    byMap.set(s.map, row);
  }
  return [...byMap.values()].sort((a, b) => b.best.expPerHour - a.best.expPerHour);
}

module.exports = { sessionStats, summarizeHistory };
