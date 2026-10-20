const DEFAULT_SETTINGS = Object.freeze({
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
  openAtLogin: false,
  position: Object.freeze({ displayId: null, relX: 1, relY: 0 }),
});

module.exports = { DEFAULT_SETTINGS };
