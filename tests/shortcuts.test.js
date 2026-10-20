const { registerShortcuts, applyShortcuts } = require('../src/main/shortcuts');

// Stand-in for Electron's globalShortcut: 'Taken' accelerators fail, 'Bad' ones throw.
function fakeGlobalShortcut() {
  const registered = new Map();
  return {
    registered,
    unregisterAll: () => registered.clear(),
    register(accel, fn) {
      if (accel.startsWith('Bad')) throw new Error('invalid accelerator');
      if (accel.startsWith('Taken')) return false;
      registered.set(accel, fn);
      return true;
    },
  };
}
const handlers = { 'clock.toggleLock': () => 'lock', 'clock.toggleHide': () => 'hide' };

test('registers both shortcuts', () => {
  const gs = fakeGlobalShortcut();
  expect(registerShortcuts({ 'clock.toggleLock': 'Control+Alt+C', 'clock.toggleHide': 'Control+Alt+H' }, handlers, gs)).toEqual({ ok: true, failed: [] });
  expect(gs.registered.get('Control+Alt+C')()).toBe('lock');
  expect(gs.registered.get('Control+Alt+H')()).toBe('hide');
});

test('an invalid or taken shortcut fails alone without stopping the other', () => {
  const gs = fakeGlobalShortcut();
  expect(registerShortcuts({ 'clock.toggleLock': 'Bad+Key', 'clock.toggleHide': 'Control+Alt+H' }, handlers, gs)).toEqual({ ok: false, failed: ['clock.toggleLock'] });
  expect(gs.registered.has('Control+Alt+H')).toBe(true);
  expect(registerShortcuts({ 'clock.toggleLock': 'Control+Alt+C', 'clock.toggleHide': 'Taken+H' }, handlers, gs)).toEqual({ ok: false, failed: ['clock.toggleHide'] });
});

test('applyShortcuts rolls back to the previous map when the new one fails', () => {
  const gs = fakeGlobalShortcut();
  const prev = { 'clock.toggleLock': 'Control+Alt+C', 'clock.toggleHide': 'Control+Alt+H' };
  const result = applyShortcuts({ 'clock.toggleLock': 'Taken+X', 'clock.toggleHide': 'Control+Alt+J' }, prev, handlers, gs);
  expect(result).toEqual({ applied: prev, failed: ['clock.toggleLock'] });
  expect([...gs.registered.keys()].sort()).toEqual(['Control+Alt+C', 'Control+Alt+H']);
});

test('applyShortcuts keeps the new map when it succeeds', () => {
  const gs = fakeGlobalShortcut();
  const next = { 'clock.toggleLock': 'Control+Alt+K', 'clock.toggleHide': 'Control+Alt+J' };
  expect(applyShortcuts(next, { 'clock.toggleLock': 'Control+Alt+C', 'clock.toggleHide': 'Control+Alt+H' }, handlers, gs)).toEqual({ applied: next, failed: [] });
});

test('registers every id in the map, including new tools', () => {
  const gs = fakeGlobalShortcut();
  const all = { ...handlers, 'meowdb.toggleActive': () => 'active', 'meowdb.toggleHide': () => 'mhide' };
  const map = { 'clock.toggleLock': 'Control+Alt+C', 'clock.toggleHide': 'Control+Alt+H', 'meowdb.toggleActive': 'Control+Alt+M', 'meowdb.toggleHide': 'Control+Alt+N' };
  expect(registerShortcuts(map, all, gs)).toEqual({ ok: true, failed: [] });
  expect(gs.registered.get('Control+Alt+M')()).toBe('active');
  expect(gs.registered.size).toBe(4);
});

test('the same key for two tools fails for the second one', () => {
  const gs = fakeGlobalShortcut();
  const all = { ...handlers, 'meowdb.toggleActive': () => 'active' };
  const map = { 'clock.toggleLock': 'Control+Alt+C', 'meowdb.toggleActive': 'Control+Alt+C' };
  expect(registerShortcuts(map, all, gs)).toEqual({ ok: false, failed: ['meowdb.toggleActive'] });
  expect(gs.registered.get('Control+Alt+C')()).toBe('lock');
});
