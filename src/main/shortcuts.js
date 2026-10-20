const NAMES = ['toggleLock', 'toggleHide'];

// `gs` defaults to Electron's globalShortcut; tests pass a stand-in.
function registerShortcuts(map, handlers, gs = require('electron').globalShortcut) {
  gs.unregisterAll();
  const failed = [];
  for (const name of NAMES) {
    let ok = false;
    try {
      ok = gs.register(map[name], handlers[name]);
    } catch {
      ok = false; // invalid accelerator strings throw
    }
    if (!ok) failed.push(name);
  }
  return { ok: failed.length === 0, failed };
}

// Try `next`; if any shortcut fails, go back to `prev` so the user is never left without one.
function applyShortcuts(next, prev, handlers, gs = require('electron').globalShortcut) {
  const { failed } = registerShortcuts(next, handlers, gs);
  if (failed.length === 0) return { applied: next, failed };
  registerShortcuts(prev, handlers, gs);
  return { applied: prev, failed };
}

module.exports = { registerShortcuts, applyShortcuts };
