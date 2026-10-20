const { createOverlay } = require('../overlay-window');

// The always-on-top clock, as a tool. See main.js for the tool interface.
function create(ctx) {
  const overlay = createOverlay(ctx.getSettings, (position) => ctx.saveSettings({ position }));

  const shortcutHandlers = {
    'clock.toggleLock'() {
      if (overlay.isLocked() && overlay.isHidden()) overlay.setHidden(false); // can't drag what you can't see
      overlay.setLocked(!overlay.isLocked());
      ctx.refreshTray();
    },
    'clock.toggleHide'() {
      overlay.setHidden(!overlay.isHidden());
      ctx.refreshTray();
    },
  };

  return {
    window: overlay.window,
    shortcutHandlers,
    trayItems: () => [
      { label: overlay.isLocked() ? 'Unlock clock to move' : 'Lock clock', click: shortcutHandlers['clock.toggleLock'] },
      { label: overlay.isHidden() ? 'Show clock' : 'Hide clock', click: shortcutHandlers['clock.toggleHide'] },
    ],
    applySettings(section, prev) {
      overlay.applySettings(section);
      if (section.position.displayId !== prev.position.displayId) overlay.moveToDisplay(section.position.displayId);
    },
    reshow: () => overlay.reshow(),
    onSecondInstance: () => overlay.setHidden(false),
  };
}

module.exports = { id: 'clock', create };
