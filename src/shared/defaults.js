const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (typeof v === 'object' && v !== null) deepFreeze(v);
  return Object.freeze(o);
};

const MEOWDB_HOME = 'https://meowdb.com/msclassic';

const DEFAULT_CLOCK = deepFreeze({
  fontFamily: '-apple-system, "Segoe UI", sans-serif',
  fontWeight: 700,
  fontSize: 64,
  color: '#ffffff',
  outlineColor: '#000000',
  outlineWidth: 3,
  opacity: 1,
  showSeconds: true,
  hour12: true,
  shortcutToggleLock: 'Control+Alt+C',
  shortcutToggleHide: 'Control+Alt+H',
  position: { displayId: null, anchorX: 'right', offsetX: 20, anchorY: 'top', offsetY: 20 },
});

const DEFAULT_MEOWDB = deepFreeze({
  startHidden: false,
  blockAds: true,
  opacity: 0.85,
  highlightColor: '#ff9f0a',
  shortcutToggleActive: 'Control+Alt+M',
  shortcutToggleHide: 'Control+Alt+N',
  lastUrl: MEOWDB_HOME,
  size: { width: 520, height: 700 },
  position: { displayId: null, anchorX: 'left', offsetX: 40, anchorY: 'top', offsetY: 80 },
});

const DEFAULT_EXP = deepFreeze({
  startHidden: false,
  opacity: 0.85,
  highlightColor: '#ff9f0a',
  autoStart: true,
  shortcutToggleActive: 'Control+Alt+E',
  shortcutToggleHide: 'Control+Alt+R',
  shortcutStartStop: 'Control+Alt+S',
  size: { width: 260, height: 300 },
  position: { displayId: null, anchorX: 'right', offsetX: 20, anchorY: 'top', offsetY: 140 },
  // Where the EXP bar and map name were last found on screen; null until located.
  regions: null,
});

const DEFAULT_SETTINGS = deepFreeze({
  version: 2,
  app: { openAtLogin: false },
  clock: DEFAULT_CLOCK,
  meowdb: DEFAULT_MEOWDB,
  exp: DEFAULT_EXP,
});

module.exports = { DEFAULT_SETTINGS, DEFAULT_CLOCK, DEFAULT_MEOWDB, DEFAULT_EXP, MEOWDB_HOME };
