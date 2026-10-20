const fs = require('fs');
const { DEFAULT_SETTINGS } = require('../shared/defaults');

const COLOR = /^#[0-9a-f]{6}$/i;
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// [min, max] for numeric fields; anything outside is clamped.
const RANGES = {
  fontWeight: [100, 900],
  fontSize: [8, 400],
  outlineWidth: [0, 20],
  opacity: [0.1, 1],
};
const COLORS = ['color', 'outlineColor'];
const STRINGS = ['fontFamily', 'shortcutToggleLock', 'shortcutToggleHide'];
const BOOLEANS = ['showSeconds', 'hour12', 'openAtLogin'];

function normalizePosition(raw) {
  const pos = { ...DEFAULT_SETTINGS.position };
  if (!isObject(raw)) return pos;
  if (raw.displayId === null || isNumber(raw.displayId)) pos.displayId = raw.displayId;
  if (isNumber(raw.relX)) pos.relX = clamp(raw.relX, 0, 1);
  if (isNumber(raw.relY)) pos.relY = clamp(raw.relY, 0, 1);
  return pos;
}

// Start from defaults and copy over only fields that are the right type and format.
function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS, position: { ...DEFAULT_SETTINGS.position } };
  if (!isObject(raw)) return settings;

  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (isNumber(raw[key])) settings[key] = clamp(raw[key], min, max);
  }
  for (const key of COLORS) {
    if (typeof raw[key] === 'string' && COLOR.test(raw[key])) settings[key] = raw[key];
  }
  for (const key of STRINGS) {
    if (typeof raw[key] === 'string' && raw[key].trim()) settings[key] = raw[key];
  }
  for (const key of BOOLEANS) {
    if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  }
  settings.position = normalizePosition(raw.position);
  return settings;
}

function loadSettings(filePath) {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return normalizeSettings({});
  }
}

// Write to a temp file and rename, so a crash mid-write can't leave a half-written file.
// Returns false instead of throwing: failing to save (e.g. antivirus holding the file) must never break the app.
function saveSettings(filePath, settings) {
  const tmp = filePath + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    console.error(`Could not save settings: ${err.message}`);
    return false;
  }
}

module.exports = { normalizeSettings, loadSettings, saveSettings };
