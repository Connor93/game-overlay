// `map` is { [shortcutId]: accelerator }, e.g. { 'clock.toggleLock': 'Control+Alt+C' }.
// `gs` defaults to Electron's globalShortcut; tests pass a stand-in.
function registerShortcuts(map, handlers, gs = require('electron').globalShortcut) {
  gs.unregisterAll();
  const failed = [];
  const used = new Set();
  for (const [id, accelerator] of Object.entries(map)) {
    if (!handlers[id]) continue;
    let ok = false;
    // One key can only do one thing; the second tool to claim it fails.
    if (!used.has(accelerator)) {
      try {
        ok = gs.register(accelerator, handlers[id]);
      } catch {
        ok = false; // invalid accelerator strings throw
      }
    }
    if (ok) used.add(accelerator);
    else failed.push(id);
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
