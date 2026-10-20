const os = require('os');
const fs = require('fs');
const path = require('path');
const {
  normalizeSettings,
  mergeSettingsPatch,
  loadSettings,
  saveSettings,
  importLegacySettings,
} = require('../src/main/settings-store');
const { DEFAULT_SETTINGS, DEFAULT_MEOWDB, MEOWDB_HOME } = require('../src/shared/defaults');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oc-')), 'settings.json');

test('empty input gives defaults', () => expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS));
test('non-object input gives defaults', () => expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS));

test('clock: keeps valid fields, drops invalid ones', () => {
  const s = normalizeSettings({ clock: { fontSize: 100, color: 'red', outlineWidth: 'x' } });
  expect(s.clock.fontSize).toBe(100);
  expect(s.clock.color).toBe('#ffffff');
  expect(s.clock.outlineWidth).toBe(3);
});
test('clock: clamps ranges', () => {
  const s = normalizeSettings({ clock: { fontSize: 9999, outlineWidth: -4, opacity: 0 } });
  expect(s.clock.fontSize).toBe(400);
  expect(s.clock.outlineWidth).toBe(0);
  expect(s.clock.opacity).toBe(0.1);
});
test('clock: keeps a valid position and rejects bad anchors and negative offsets', () => {
  expect(normalizeSettings({ clock: { position: { displayId: 5, anchorX: 'left', offsetX: 7, anchorY: 'bottom', offsetY: 0 } } }).clock.position)
    .toEqual({ displayId: 5, anchorX: 'left', offsetX: 7, anchorY: 'bottom', offsetY: 0 });
  expect(normalizeSettings({ clock: { position: { anchorX: 'middle', offsetX: -3 } } }).clock.position).toEqual(DEFAULT_SETTINGS.clock.position);
});

test('0.1.x flat clock settings become the clock section and app.openAtLogin', () => {
  const s = normalizeSettings({ fontSize: 90, openAtLogin: true, position: { displayId: 2, anchorX: 'left', offsetX: 5, anchorY: 'top', offsetY: 6 } });
  expect(s.clock.fontSize).toBe(90);
  expect(s.clock.position).toEqual({ displayId: 2, anchorX: 'left', offsetX: 5, anchorY: 'top', offsetY: 6 });
  expect(s.app.openAtLogin).toBe(true);
  expect(s.meowdb).toEqual(DEFAULT_MEOWDB);
});
test('0.1.0 relX/relY inside flat settings still keeps its corner', () =>
  expect(normalizeSettings({ position: { relX: 0, relY: 1 } }).clock.position).toMatchObject({ anchorX: 'left', anchorY: 'bottom' }));

test('meowdb section is validated and clamped', () => {
  const s = normalizeSettings({ clock: {}, meowdb: { opacity: 5, highlightColor: 'orange', size: { width: 10, height: 99999 }, lastUrl: 'https://evil.example/x' } });
  expect(s.meowdb.opacity).toBe(1);
  expect(s.meowdb.highlightColor).toBe('#ff9f0a');
  expect(s.meowdb.size).toEqual({ width: 320, height: 4000 });
  expect(s.meowdb.lastUrl).toBe(MEOWDB_HOME);
});
test('meowdb lastUrl on meowdb.com or a subdomain is kept', () => {
  expect(normalizeSettings({ meowdb: { lastUrl: 'https://meowdb.com/mob/123' } }).meowdb.lastUrl).toBe('https://meowdb.com/mob/123');
  expect(normalizeSettings({ meowdb: { lastUrl: 'https://www.meowdb.com/a' } }).meowdb.lastUrl).toBe('https://www.meowdb.com/a');
  expect(normalizeSettings({ meowdb: { lastUrl: 'https://meowdb.com.evil.io/' } }).meowdb.lastUrl).toBe(MEOWDB_HOME);
  expect(normalizeSettings({ meowdb: { lastUrl: 'http://meowdb.com/' } }).meowdb.lastUrl).toBe(MEOWDB_HOME);
});

test('mergeSettingsPatch merges one section and nested position', () => {
  const s = mergeSettingsPatch(DEFAULT_SETTINGS, { meowdb: { opacity: 0.5, position: { offsetX: 99 } } });
  expect(s.meowdb.opacity).toBe(0.5);
  expect(s.meowdb.position).toEqual({ ...DEFAULT_MEOWDB.position, offsetX: 99 });
  expect(s.clock).toEqual(DEFAULT_SETTINGS.clock);
});
test('mergeSettingsPatch merges nested size', () =>
  expect(mergeSettingsPatch(DEFAULT_SETTINGS, { meowdb: { size: { height: 500 } } }).meowdb.size).toEqual({ width: 520, height: 500 }));

test('missing file gives defaults', () => expect(loadSettings(tmp())).toEqual(DEFAULT_SETTINGS));
test('corrupt file gives defaults', () => {
  const f = tmp();
  fs.writeFileSync(f, '{"fontSize": 80,');
  expect(loadSettings(f)).toEqual(DEFAULT_SETTINGS);
});
test('save then load round-trips', () => {
  const f = tmp();
  const s = mergeSettingsPatch(DEFAULT_SETTINGS, { clock: { fontSize: 90, hour12: false }, meowdb: { opacity: 0.6 } });
  saveSettings(f, s);
  expect(loadSettings(f)).toEqual(s);
  expect(fs.existsSync(f + '.tmp')).toBe(false);
});
test('save failure returns false instead of throwing', () => {
  const f = path.join(os.tmpdir(), 'oc-missing-dir-' + Date.now(), 'settings.json');
  expect(saveSettings(f, DEFAULT_SETTINGS)).toBe(false);
});
test('save success returns true', () => expect(saveSettings(tmp(), DEFAULT_SETTINGS)).toBe(true));

test('importLegacySettings copies the old file once and never overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-'));
  const legacy = path.join(dir, 'old.json');
  const next = path.join(dir, 'new', 'settings.json');
  fs.writeFileSync(legacy, '{"fontSize": 77}');
  expect(importLegacySettings(next, legacy)).toBe(true);
  expect(loadSettings(next).clock.fontSize).toBe(77);
  fs.writeFileSync(legacy, '{"fontSize": 11}');
  expect(importLegacySettings(next, legacy)).toBe(false);
  expect(loadSettings(next).clock.fontSize).toBe(77);
});
test('importLegacySettings with no legacy file is a no-op', () =>
  expect(importLegacySettings(path.join(os.tmpdir(), 'nope-new.json'), path.join(os.tmpdir(), 'nope-old.json'))).toBe(false));

test('meowdb home is the MapleStory Classic section', () => {
  expect(MEOWDB_HOME).toBe('https://meowdb.com/msclassic');
  expect(DEFAULT_MEOWDB.lastUrl).toBe('https://meowdb.com/msclassic');
});
