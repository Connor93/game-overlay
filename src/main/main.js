const path = require('path');
const { app, globalShortcut } = require('electron');
const { loadSettings, saveSettings } = require('./settings-store');
const { createOverlay } = require('./overlay-window');
const { registerShortcuts } = require('./shortcuts');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // No Dock icon. This also lets the overlay join other apps' full-screen spaces.
  if (process.platform === 'darwin') app.dock.hide();

  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let settings = loadSettings(settingsPath);
  let overlay;

  function setPosition(position) {
    settings = { ...settings, position };
    saveSettings(settingsPath, settings);
  }

  const shortcutMap = (s) => ({ toggleLock: s.shortcutToggleLock, toggleHide: s.shortcutToggleHide });
  const shortcutHandlers = {
    toggleLock() {
      if (overlay.isLocked() && overlay.isHidden()) overlay.setHidden(false); // can't drag what you can't see
      overlay.setLocked(!overlay.isLocked());
    },
    toggleHide: () => overlay.setHidden(!overlay.isHidden()),
  };

  app.whenReady().then(() => {
    overlay = createOverlay(() => settings, setPosition);
    const { failed } = registerShortcuts(shortcutMap(settings), shortcutHandlers);
    if (failed.length) console.error(`Could not register shortcuts: ${failed.join(', ')}`);
  });

  // It's a tray app: closing windows must not quit it.
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
