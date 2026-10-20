// Turns trusted EXP readings into training sessions, following the rules the user chose:
// sessions start from Start or steady EXP gain, end on Stop or a map change, pause after 45 s
// without EXP, and only sessions with at least a minute of training are kept.

const AUTO_START_GAINS = 3;
const AUTO_START_WINDOW_MS = 20000;
const PAUSE_AFTER_MS = 45000;
const END_AFTER_PAUSE_MS = 600000;
const MIN_SAVE_MS = 60000;
const MAP_CONFIRM_READS = 2;
const RECENT_GAINS_MS = 10 * 60 * 1000;
const UNKNOWN_MAP = 'Unknown map';

const midpoint = ([lo, hi]) => (Number.isFinite(hi) ? (lo + hi) / 2 : lo);

function createSessionMachine({ autoStart = true, onSave }) {
  let autoStartEnabled = autoStart;
  let autoStartArmed = true; // Stop disarms until the next map change; Start re-arms
  let status = 'idle';
  let session = null;
  let currentMap = null; // last confirmed { street, map }
  let pendingMap = null; // { name, count } — a different name waiting for confirmation
  let lastExp = null;
  let lastPct = null;
  let lastSampleT = null;
  let lastGainT = null;
  let pausedAt = null;
  let idleGains = []; // gain times while idle, for auto-start

  function start(t) {
    if (session) return;
    session = {
      id: `${t}-${Math.random().toString(36).slice(2, 8)}`,
      map: currentMap ? currentMap.map : UNKNOWN_MAP,
      street: currentMap ? currentMap.street : null,
      userNamed: false,
      startedAt: t,
      endedAt: null,
      trainingMs: 0,
      gainedExp: 0,
      startLevelPct: lastPct,
      endLevelPct: lastPct,
      levelUps: 0,
      gains: [],
    };
    status = 'tracking';
    autoStartArmed = true;
    lastSampleT = t;
    lastGainT = null;
    pausedAt = null;
    idleGains = [];
  }

  function end(t) {
    if (!session) return;
    const finished = { ...session, endedAt: t };
    delete finished.gains;
    delete finished.userNamed;
    if (finished.trainingMs >= MIN_SAVE_MS) onSave(finished);
    session = null;
    status = 'idle';
    pausedAt = null;
    idleGains = [];
  }

  function onMapRead(map, t) {
    if (!map) return; // unreadable: keep whatever we knew
    if (!currentMap) {
      currentMap = map;
    } else if (map.map !== currentMap.map) {
      pendingMap = pendingMap && pendingMap.name === map.map ? { name: map.map, count: pendingMap.count + 1 } : { name: map.map, count: 1 };
      if (pendingMap.count < MAP_CONFIRM_READS) return;
      // Moved to a different map: the session there is over, and nothing starts by itself.
      end(t);
      currentMap = map;
      autoStartArmed = true;
    }
    pendingMap = null;
    if (session && session.map === UNKNOWN_MAP && !session.userNamed) {
      session.map = currentMap.map;
      session.street = currentMap.street;
    }
  }

  function onGain(delta, t) {
    if (delta > 0) lastGainT = t;
    if (status === 'paused' && delta > 0) {
      status = 'tracking';
      pausedAt = null;
    }
    if (session) {
      session.gainedExp += delta;
      session.gains.push({ t, exp: delta });
      session.gains = session.gains.filter((g) => t - g.t <= RECENT_GAINS_MS);
      return;
    }
    if (delta <= 0 || !autoStartEnabled || !autoStartArmed) return;
    idleGains = [...idleGains.filter((g) => t - g < AUTO_START_WINDOW_MS), t];
    if (idleGains.length >= AUTO_START_GAINS) {
      start(t);
      lastGainT = t;
      session.gainedExp += delta;
      session.gains.push({ t, exp: delta });
    }
  }

  function sample({ t, verdict, map }) {
    onMapRead(map, t);
    if (status === 'tracking' && lastSampleT !== null) session.trainingMs += t - lastSampleT;
    lastSampleT = t;
    if (!verdict || (verdict.status !== 'ok' && verdict.status !== 'levelup')) return;

    let delta = null;
    if (verdict.status === 'levelup' && lastExp !== null) {
      delta = midpoint(verdict.previousRequired) - lastExp + verdict.exp;
      if (session) session.levelUps += 1;
    } else if (lastExp !== null) {
      delta = verdict.exp - lastExp;
    }
    lastExp = verdict.exp;
    lastPct = verdict.pct;
    if (session) session.endLevelPct = verdict.pct;
    if (delta) onGain(delta, t);
  }

  function tick(t) {
    if (status === 'tracking') {
      const since = Math.max(lastGainT ?? -Infinity, session.startedAt);
      if (t - since >= PAUSE_AFTER_MS) {
        // Paused: the stretch since the last EXP wasn't training.
        session.trainingMs = Math.max(0, session.trainingMs - (lastSampleT - since));
        status = 'paused';
        pausedAt = since;
      }
    } else if (status === 'paused' && t - pausedAt > END_AFTER_PAUSE_MS) {
      end(t);
    }
  }

  return {
    sample,
    tick,
    start,
    stop(t) {
      end(t);
      autoStartArmed = false;
    },
    quit: end,
    nameMap(name) {
      if (!session || !name.trim()) return;
      session.map = name.trim();
      session.street = null;
      session.userNamed = true;
    },
    setAutoStart(value) {
      autoStartEnabled = value;
    },
    state: () => ({
      status,
      autoStartArmed,
      autoStartEnabled,
      map: currentMap,
      needsMapName: Boolean(session && session.map === UNKNOWN_MAP),
      lastExp,
      lastPct,
      session: session ? { ...session, gains: [...session.gains] } : null,
    }),
  };
}

module.exports = {
  createSessionMachine,
  AUTO_START_GAINS,
  AUTO_START_WINDOW_MS,
  PAUSE_AFTER_MS,
  END_AFTER_PAUSE_MS,
  MIN_SAVE_MS,
  UNKNOWN_MAP,
};
