const path = require('path');
const { app, globalShortcut, screen } = require('electron');
const { DEFAULT_SETTINGS } = require('../shared/defaults');
const { normalizeSettings, loadSettings, saveSettings } = require('./settings-store');
const { createOverlay } = require('./overlay-window');
const { registerShortcuts, applyShortcuts } = require('./shortcuts');
const { createTray } = require('./tray');
const { setupSettingsWindow } = require('./settings-window');
const { loginItemSettings } = require('./login-item');

const SAVE_DELAY_MS = 300;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // No Dock icon. This also lets the overlay join other apps' full-screen spaces.
  if (process.platform === 'darwin') app.dock.hide();

  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let settings = loadSettings(settingsPath);
  let overlay;
  let tray;
  let openSettings;
  let shortcutErrors = []; // settings fields whose shortcut isn't registered right now

  // Sliders send many changes a second; batch the writes.
  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveSettings(settingsPath, settings);
  }

  function setPosition(position) {
    settings = { ...settings, position };
    saveSoon();
  }

  const shortcutMap = (s) => ({ toggleLock: s.shortcutToggleLock, toggleHide: s.shortcutToggleHide });
  const SHORTCUT_FIELDS = { toggleLock: 'shortcutToggleLock', toggleHide: 'shortcutToggleHide' };
  const shortcutHandlers = {
    toggleLock() {
      if (overlay.isLocked() && overlay.isHidden()) overlay.setHidden(false); // can't drag what you can't see
      overlay.setLocked(!overlay.isLocked());
      tray.refresh();
    },
    toggleHide() {
      overlay.setHidden(!overlay.isHidden());
      tray.refresh();
    },
  };

  // Displays for the "Show on" picker, numbered left to right.
  function getDisplays() {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen
      .getAllDisplays()
      .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
      .map((d, i) => ({
        id: d.id,
        primary: d.id === primaryId,
        label: `Display ${i + 1}${d.label ? ` – ${d.label}` : ''}${d.id === primaryId ? ' (Main)' : ''}`,
      }));
  }

  // Apply a full new settings object: shortcuts (with rollback), login item, overlay, display.
  function commitSettings(next) {
    const prevShortcuts = shortcutMap(settings);
    const nextShortcuts = shortcutMap(next);
    const shortcutsChanged =
      nextShortcuts.toggleLock !== prevShortcuts.toggleLock || nextShortcuts.toggleHide !== prevShortcuts.toggleHide;
    // Also retry when something failed before, e.g. the user re-picks a key another app has since released.
    if (shortcutsChanged || shortcutErrors.length) {
      const { applied, failed } = applyShortcuts(nextShortcuts, prevShortcuts, shortcutHandlers);
      next.shortcutToggleLock = applied.toggleLock;
      next.shortcutToggleHide = applied.toggleHide;
      shortcutErrors = failed.map((name) => SHORTCUT_FIELDS[name]);
    }
    // In development this would register the bare Electron binary, so only do it in the real app.
    if (app.isPackaged && next.openAtLogin !== settings.openAtLogin) {
      app.setLoginItemSettings(loginItemSettings(next.openAtLogin));
    }
    const displayChanged = next.position.displayId !== settings.position.displayId;
    settings = next;
    saveSoon();
    overlay.applySettings(settings);
    if (displayChanged) overlay.moveToDisplay(settings.position.displayId);
    return { settings, shortcutErrors };
  }

  function updateSettings(patch) {
    const position = { ...settings.position, ...(patch.position || {}) };
    return commitSettings(normalizeSettings({ ...settings, ...patch, position }));
  }

  // Everything back to defaults except where the clock currently is.
  function resetSettings() {
    return commitSettings(normalizeSettings({ ...DEFAULT_SETTINGS, position: settings.position }));
  }

  app.whenReady().then(() => {
    overlay = createOverlay(() => settings, setPosition);
    openSettings = setupSettingsWindow({
      getSettings: () => settings,
      getShortcutErrors: () => shortcutErrors,
      getDisplays,
      updateSettings,
      resetSettings,
    });
    tray = createTray({ overlay, openSettings, quit: () => app.quit() });
    const { failed } = registerShortcuts(shortcutMap(settings), shortcutHandlers);
    shortcutErrors = failed.map((name) => SHORTCUT_FIELDS[name]);
    if (failed.length) console.error(`Could not register shortcuts: ${failed.join(', ')}`);
    // The user may have removed the login item in the OS; show what's really set.
    if (app.isPackaged) {
      settings.openAtLogin = app.getLoginItemSettings(loginItemSettings(settings.openAtLogin)).openAtLogin;
    }
  });

  // Launching it again (e.g. from the Start menu when the tray icon is tucked away) brings the clock back.
  app.on('second-instance', () => {
    if (!overlay) return;
    overlay.setHidden(false);
    tray.refresh();
    openSettings();
  });

  // It's a tray app: closing windows must not quit it.
  app.on('window-all-closed', () => {});
  // The overlay isn't closable (see overlay-window.js), so quitting has to destroy it explicitly.
  app.on('before-quit', () => {
    if (overlay && !overlay.window.isDestroyed()) overlay.window.destroy();
  });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (saveTimer) saveNow();
  });
}
