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
const handlers = { toggleLock: () => 'lock', toggleHide: () => 'hide' };

test('registers both shortcuts', () => {
  const gs = fakeGlobalShortcut();
  expect(registerShortcuts({ toggleLock: 'Control+Alt+C', toggleHide: 'Control+Alt+H' }, handlers, gs)).toEqual({ ok: true, failed: [] });
  expect(gs.registered.get('Control+Alt+C')()).toBe('lock');
  expect(gs.registered.get('Control+Alt+H')()).toBe('hide');
});

test('an invalid or taken shortcut fails alone without stopping the other', () => {
  const gs = fakeGlobalShortcut();
  expect(registerShortcuts({ toggleLock: 'Bad+Key', toggleHide: 'Control+Alt+H' }, handlers, gs)).toEqual({ ok: false, failed: ['toggleLock'] });
  expect(gs.registered.has('Control+Alt+H')).toBe(true);
  expect(registerShortcuts({ toggleLock: 'Control+Alt+C', toggleHide: 'Taken+H' }, handlers, gs)).toEqual({ ok: false, failed: ['toggleHide'] });
});

test('applyShortcuts rolls back to the previous map when the new one fails', () => {
  const gs = fakeGlobalShortcut();
  const prev = { toggleLock: 'Control+Alt+C', toggleHide: 'Control+Alt+H' };
  const result = applyShortcuts({ toggleLock: 'Taken+X', toggleHide: 'Control+Alt+J' }, prev, handlers, gs);
  expect(result).toEqual({ applied: prev, failed: ['toggleLock'] });
  expect([...gs.registered.keys()].sort()).toEqual(['Control+Alt+C', 'Control+Alt+H']);
});

test('applyShortcuts keeps the new map when it succeeds', () => {
  const gs = fakeGlobalShortcut();
  const next = { toggleLock: 'Control+Alt+K', toggleHide: 'Control+Alt+J' };
  expect(applyShortcuts(next, { toggleLock: 'Control+Alt+C', toggleHide: 'Control+Alt+H' }, handlers, gs)).toEqual({ applied: next, failed: [] });
});
