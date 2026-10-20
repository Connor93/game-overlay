const os = require('os');
const fs = require('fs');
const path = require('path');
const { normalizeSettings, loadSettings, saveSettings } = require('../src/main/settings-store');
const { DEFAULT_SETTINGS } = require('../src/shared/defaults');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oc-')), 'settings.json');

test('empty input gives defaults', () => expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS));
test('non-object input gives defaults', () => expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS));
test('keeps valid fields, drops invalid ones', () => {
  const s = normalizeSettings({ fontSize: 100, color: 'red', outlineWidth: 'x' });
  expect(s.fontSize).toBe(100);
  expect(s.color).toBe('#ffffff');
  expect(s.outlineWidth).toBe(3);
});
test('clamps ranges', () => {
  const s = normalizeSettings({ fontSize: 9999, outlineWidth: -4, opacity: 0, position: { displayId: 5, relX: 3, relY: -1 } });
  expect(s.fontSize).toBe(400);
  expect(s.outlineWidth).toBe(0);
  expect(s.opacity).toBe(0.1);
  expect(s.position).toEqual({ displayId: 5, relX: 1, relY: 0 });
});
test('missing file gives defaults', () => expect(loadSettings(tmp())).toEqual(DEFAULT_SETTINGS));
test('corrupt file gives defaults', () => {
  const f = tmp();
  fs.writeFileSync(f, '{"fontSize": 80,');
  expect(loadSettings(f)).toEqual(DEFAULT_SETTINGS);
});
test('save then load round-trips', () => {
  const f = tmp();
  const s = { ...DEFAULT_SETTINGS, fontSize: 90, hour12: false };
  saveSettings(f, s);
  expect(loadSettings(f)).toEqual(s);
  expect(fs.existsSync(f + '.tmp')).toBe(false);
});
