const path = require('path');
const { BrowserWindow, ipcMain, session } = require('electron');

// Registers the settings IPC once and returns an `open()` that shows (or focuses) the window.
function setupSettingsWindow({ getSettings, getDisplays, updateSettings, resetSettings }) {
  let win = null;

  ipcMain.handle('settings:get', () => ({ settings: getSettings(), displays: getDisplays() }));
  ipcMain.handle('settings:update', (_e, patch) => updateSettings(patch));
  ipcMain.handle('settings:reset', () => resetSettings());

  // The font picker uses the Local Font Access API; allow it for the settings window only.
  const isSettings = (wc) => win !== null && !win.isDestroyed() && wc === win.webContents;
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) =>
    callback(permission === 'local-fonts' && isSettings(wc)),
  );
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'local-fonts' && isSettings(wc));

  return function open() {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      return;
    }
    win = new BrowserWindow({
      width: 440,
      height: 760,
      title: 'Overlay Clock Settings',
      resizable: true,
      minimizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/settings-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.loadFile(path.join(__dirname, '../renderer/settings/index.html'));
    win.on('closed', () => {
      win = null;
    });
  };
}

module.exports = { setupSettingsWindow };
