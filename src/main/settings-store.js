const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS, DEFAULT_CLOCK, DEFAULT_MEOWDB, DEFAULT_EXP, MEOWDB_HOME } = require('../shared/defaults');

const COLOR = /^#[0-9a-f]{6}$/i;
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isString = (v) => typeof v === 'string' && v.trim() !== '';
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const MAX_OFFSET = 10000;
const OLD_MARGIN = 20;

// meowdb.com or a subdomain, https only.
function isMeowdbUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'meowdb.com' || u.hostname.endsWith('.meowdb.com'));
  } catch {
    return false;
  }
}

function normalizePosition(raw, defaults) {
  const pos = { ...defaults };
  if (!isObject(raw)) return pos;
  if (raw.displayId === null || isNumber(raw.displayId)) pos.displayId = raw.displayId;
  // Version 0.1.0 stored relX/relY (0..1); keep the corner it was nearest to.
  if (isNumber(raw.relX)) Object.assign(pos, { anchorX: raw.relX >= 0.5 ? 'right' : 'left', offsetX: OLD_MARGIN });
  if (isNumber(raw.relY)) Object.assign(pos, { anchorY: raw.relY >= 0.5 ? 'bottom' : 'top', offsetY: OLD_MARGIN });
  if (raw.anchorX === 'left' || raw.anchorX === 'right') pos.anchorX = raw.anchorX;
  if (raw.anchorY === 'top' || raw.anchorY === 'bottom') pos.anchorY = raw.anchorY;
  if (isNumber(raw.offsetX) && raw.offsetX >= 0) pos.offsetX = Math.min(raw.offsetX, MAX_OFFSET);
  if (isNumber(raw.offsetY) && raw.offsetY >= 0) pos.offsetY = Math.min(raw.offsetY, MAX_OFFSET);
  return pos;
}

// Copy fields from raw onto defaults, keeping only values of the right type, clamped to range.
function pickFields(raw, defaults, { ranges = {}, colors = [], strings = [], booleans = [] }) {
  const out = { ...defaults };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (isNumber(raw[key])) out[key] = clamp(raw[key], min, max);
  }
  for (const key of colors) if (typeof raw[key] === 'string' && COLOR.test(raw[key])) out[key] = raw[key];
  for (const key of strings) if (isString(raw[key])) out[key] = raw[key];
  for (const key of booleans) if (typeof raw[key] === 'boolean') out[key] = raw[key];
  return out;
}

function normalizeClock(raw) {
  if (!isObject(raw)) raw = {};
  const clock = pickFields(raw, DEFAULT_CLOCK, {
    ranges: { fontWeight: [100, 900], fontSize: [8, 400], outlineWidth: [0, 20], opacity: [0.1, 1] },
    colors: ['color', 'outlineColor'],
    strings: ['fontFamily', 'shortcutToggleLock', 'shortcutToggleHide'],
    booleans: ['showSeconds', 'hour12'],
  });
  clock.position = normalizePosition(raw.position, DEFAULT_CLOCK.position);
  return clock;
}

function normalizeMeowdb(raw) {
  if (!isObject(raw)) raw = {};
  const meowdb = pickFields(raw, DEFAULT_MEOWDB, {
    ranges: { opacity: [0.1, 1] },
    colors: ['highlightColor'],
    strings: ['shortcutToggleActive', 'shortcutToggleHide'],
    booleans: ['startHidden', 'blockAds'],
  });
  meowdb.lastUrl = isMeowdbUrl(raw.lastUrl) ? raw.lastUrl : MEOWDB_HOME;
  const size = isObject(raw.size) ? raw.size : {};
  meowdb.size = {
    width: isNumber(size.width) ? clamp(size.width, 320, 4000) : DEFAULT_MEOWDB.size.width,
    height: isNumber(size.height) ? clamp(size.height, 300, 4000) : DEFAULT_MEOWDB.size.height,
  };
  meowdb.position = normalizePosition(raw.position, DEFAULT_MEOWDB.position);
  return meowdb;
}

const isRect = (r) => isObject(r) && ['x', 'y', 'width', 'height'].every((k) => isNumber(r[k])) && r.width > 0 && r.height > 0;

function normalizeRegions(raw) {
  if (!isObject(raw) || !isNumber(raw.displayId) || !isRect(raw.exp) || !isNumber(raw.textHeight)) return null;
  return { displayId: raw.displayId, exp: { ...raw.exp }, map: isRect(raw.map) ? { ...raw.map } : null, textHeight: raw.textHeight };
}

function normalizeExp(raw) {
  if (!isObject(raw)) raw = {};
  const exp = pickFields(raw, DEFAULT_EXP, {
    ranges: { opacity: [0.1, 1] },
    colors: ['highlightColor'],
    strings: ['shortcutToggleActive', 'shortcutToggleHide', 'shortcutStartStop'],
    booleans: ['startHidden', 'autoStart'],
  });
  const size = isObject(raw.size) ? raw.size : {};
  exp.size = {
    width: isNumber(size.width) ? clamp(size.width, 220, 4000) : DEFAULT_EXP.size.width,
    height: isNumber(size.height) ? clamp(size.height, 200, 4000) : DEFAULT_EXP.size.height,
  };
  exp.position = normalizePosition(raw.position, DEFAULT_EXP.position);
  exp.regions = normalizeRegions(raw.regions);
  return exp;
}

// Overlay Clock 0.1.x stored the clock settings flat at the top level.
const isLegacyFlat = (raw) => !isObject(raw.clock) && Object.keys(DEFAULT_CLOCK).some((key) => key in raw);

function normalizeSettings(raw) {
  if (!isObject(raw)) raw = {};
  const legacy = isLegacyFlat(raw);
  const app = legacy ? { openAtLogin: raw.openAtLogin } : isObject(raw.app) ? raw.app : {};
  return {
    version: DEFAULT_SETTINGS.version,
    app: { openAtLogin: typeof app.openAtLogin === 'boolean' ? app.openAtLogin : DEFAULT_SETTINGS.app.openAtLogin },
    clock: normalizeClock(legacy ? raw : raw.clock),
    meowdb: normalizeMeowdb(raw.meowdb),
    exp: normalizeExp(raw.exp),
  };
}

// Apply a partial { app?, clock?, meowdb?, exp? } on top of settings, merging position/size one level deeper.
function mergeSettingsPatch(settings, patch) {
  const merged = { ...settings };
  for (const section of ['app', 'clock', 'meowdb', 'exp']) {
    const p = patch[section];
    if (!isObject(p)) continue;
    const next = { ...settings[section], ...p };
    for (const nested of ['position', 'size']) {
      if (isObject(p[nested])) next[nested] = { ...settings[section][nested], ...p[nested] };
    }
    merged[section] = next;
  }
  return normalizeSettings(merged);
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

// First launch after the rename: bring over Overlay Clock's settings. Never overwrites.
function importLegacySettings(newPath, legacyPath) {
  try {
    if (fs.existsSync(newPath) || !fs.existsSync(legacyPath)) return false;
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.copyFileSync(legacyPath, newPath);
    return true;
  } catch (err) {
    console.error(`Could not import Overlay Clock settings: ${err.message}`);
    return false;
  }
}

module.exports = { isMeowdbUrl, normalizeSettings, mergeSettingsPatch, loadSettings, saveSettings, importLegacySettings };
