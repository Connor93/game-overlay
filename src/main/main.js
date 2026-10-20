const path = require('path');
const { app, globalShortcut } = require('electron');
const { loadSettings, saveSettings } = require('./settings-store');
const { createOverlay } = require('./overlay-window');

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

  app.whenReady().then(() => {
    overlay = createOverlay(() => settings, setPosition);
    // TEMPORARY (Task 4): checks shortcuts fire while a full-screen game has focus.
    globalShortcut.register('Control+Alt+H', () => overlay.setHidden(!overlay.isHidden()));
  });

  // It's a tray app: closing windows must not quit it.
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
