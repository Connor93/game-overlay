const path = require('path');
const { app, globalShortcut, screen } = require('electron');
const { DEFAULT_SETTINGS } = require('../shared/defaults');
const {
  normalizeSettings,
  mergeSettingsPatch,
  loadSettings,
  saveSettings,
  importLegacySettings,
} = require('./settings-store');
const { registerShortcuts, applyShortcuts } = require('./shortcuts');
const { shortcutMapFromSettings, withAppliedShortcuts } = require('./shortcut-fields');
const { createTray } = require('./tray');
const { setupSettingsWindow } = require('./settings-window');
const { loginItemSettings } = require('./login-item');

// Each tool module exports { id, create(ctx) } and create() returns:
//   { window, shortcutHandlers: { [shortcutId]: fn }, trayItems(), applySettings(section, prevSection),
//     reshow(), onSecondInstance() }
// ctx gives a tool its own settings section: getSettings(), saveSettings(patch) (save without
// re-applying), updateSettings(patch) (save and apply), plus refreshTray() and reshowOverlays().
const TOOL_MODULES = [require('./tools/clock'), require('./tools/meowdb'), require('./tools/exp')];

const SAVE_DELAY_MS = 300;
// What a "reset to defaults" keeps per section, so the tool stays where the user put it.
const KEEP_ON_RESET = { clock: ['position'], meowdb: ['position', 'size', 'lastUrl'], exp: ['position', 'size', 'regions'] };

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // No Dock icon. This also lets the overlays join other apps' full-screen spaces.
  if (process.platform === 'darwin') app.dock.hide();

  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  // First launch after the rename from Overlay Clock: bring its settings over.
  const importedLegacy = importLegacySettings(
    settingsPath,
    path.join(app.getPath('appData'), 'overlay-clock', 'settings.json'),
  );
  let settings = loadSettings(settingsPath);
  const tools = {};
  let tray;
  let openSettings;
  let shortcutErrors = []; // shortcut ids that aren't registered right now

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

  const allShortcutHandlers = () => Object.assign({}, ...Object.values(tools).map((t) => t.shortcutHandlers));

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

  // Apply a full new settings object: shortcuts (with rollback), login item, then each changed tool.
  function commitSettings(next) {
    const prevShortcuts = shortcutMapFromSettings(settings);
    const nextShortcuts = shortcutMapFromSettings(next);
    const shortcutsChanged = Object.keys(nextShortcuts).some((id) => nextShortcuts[id] !== prevShortcuts[id]);
    // Also retry when something failed before, e.g. the user re-picks a key another app has since released.
    if (shortcutsChanged || shortcutErrors.length) {
      const { applied, failed } = applyShortcuts(nextShortcuts, prevShortcuts, allShortcutHandlers());
      next = withAppliedShortcuts(next, applied);
      shortcutErrors = failed;
    }
    // In development this would register the bare Electron binary, so only do it in the real app.
    if (app.isPackaged && next.app.openAtLogin !== settings.app.openAtLogin) {
      app.setLoginItemSettings(loginItemSettings(next.app.openAtLogin));
    }
    const prev = settings;
    settings = next;
    saveSoon();
    for (const [id, tool] of Object.entries(tools)) {
      if (JSON.stringify(next[id]) !== JSON.stringify(prev[id])) tool.applySettings(next[id], prev[id]);
    }
    return { settings, shortcutErrors };
  }

  const updateSettings = (patch) => commitSettings(mergeSettingsPatch(settings, patch));

  function resetSettings(section) {
    if (!KEEP_ON_RESET[section]) return { settings, shortcutErrors };
    const kept = Object.fromEntries(KEEP_ON_RESET[section].map((key) => [key, settings[section][key]]));
    return commitSettings(normalizeSettings({ ...settings, [section]: { ...DEFAULT_SETTINGS[section], ...kept } }));
  }

  function contextFor(id) {
    return {
      getSettings: () => settings[id],
      saveSettings(patch) {
        settings = mergeSettingsPatch(settings, { [id]: patch });
        saveSoon();
      },
      updateSettings: (patch) => updateSettings({ [id]: patch }),
      refreshTray: () => tray && tray.refresh(),
      reshowOverlays: () => Object.values(tools).forEach((t) => t.reshow()),
    };
  }

  app.whenReady().then(() => {
    for (const mod of TOOL_MODULES) tools[mod.id] = mod.create(contextFor(mod.id));
    // Lets a debugger drive the tools during manual testing; off unless explicitly enabled.
    if (process.env.GAME_OVERLAY_DEBUG) globalThis.gameOverlay = { tools, getSettings: () => settings };
    openSettings = setupSettingsWindow({
      getSettings: () => settings,
      getShortcutErrors: () => shortcutErrors,
      getDisplays,
      updateSettings,
      resetSettings,
    });
    tray = createTray({
      getSections: () => Object.values(tools).map((t) => t.trayItems()),
      openSettings,
      quit: () => app.quit(),
    });
    const { failed } = registerShortcuts(shortcutMapFromSettings(settings), allShortcutHandlers());
    shortcutErrors = failed;
    if (failed.length) console.error(`Could not register shortcuts: ${failed.join(', ')}`);
    // Overlay Clock's "start at login" registered Overlay Clock, not us; carry the choice over.
    if (app.isPackaged && importedLegacy && settings.app.openAtLogin) {
      app.setLoginItemSettings(loginItemSettings(true));
    }
    // The user may have removed the login item in the OS; show what's really set.
    if (app.isPackaged) {
      const { openAtLogin } = app.getLoginItemSettings(loginItemSettings(settings.app.openAtLogin));
      settings = mergeSettingsPatch(settings, { app: { openAtLogin } });
    }
  });

  // Launching it again (e.g. from the Start menu when the tray icon is tucked away) brings things back.
  app.on('second-instance', () => {
    if (!tray) return;
    Object.values(tools).forEach((t) => t.onSecondInstance());
    tray.refresh();
    openSettings();
  });

  // It's a tray app: closing windows must not quit it.
  app.on('window-all-closed', () => {});
  // Tool windows aren't closable (see overlay-window.js), so quitting has to destroy them explicitly.
  app.on('before-quit', () => {
    for (const tool of Object.values(tools)) if (!tool.window.isDestroyed()) tool.window.destroy();
  });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (saveTimer) saveNow();
  });
}
