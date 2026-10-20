const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');
const { resolvePlacement, relativeFromBounds } = require('./placement');

const TOP_LEVEL = 'screen-saver';
const REASSERT_TOP_MS = 2000;

function toDisplayInfo(display) {
  return { id: display.id, workArea: display.workArea, primary: display.id === screen.getPrimaryDisplay().id };
}

function createOverlay(getSettings, onPositionChange) {
  const win = new BrowserWindow({
    width: 10,
    height: 10,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    // On Windows a drag region acts like a title bar; without these, its right-click menu could close the clock.
    closable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, TOP_LEVEL);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true);
  win.on('system-context-menu', (event) => event.preventDefault());

  let locked = true;
  let hidden = false;
  let size = null;

  // Something else (a game, another overlay) can take the top spot; keep claiming it.
  const topTimer = setInterval(() => win.setAlwaysOnTop(true, TOP_LEVEL), REASSERT_TOP_MS);

  function place() {
    if (!size) return;
    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const { x, y } = resolvePlacement(getSettings().position, displays, size);
    win.setBounds({ x, y, width: size.width, height: size.height });
  }

  function show() {
    win.showInactive();
    win.setAlwaysOnTop(true, TOP_LEVEL);
  }

  const onSize = (event, newSize) => {
    if (event.sender !== win.webContents) return;
    const firstSize = !size;
    size = newSize;
    // While unlocked the user may be mid-drag, so only resize in place.
    if (locked) place();
    else win.setSize(size.width, size.height);
    if (firstSize && !hidden) show();
  };
  ipcMain.on('overlay:size', onSize);

  const currentPosition = () => {
    const bounds = win.getBounds();
    return relativeFromBounds(bounds, toDisplayInfo(screen.getDisplayMatching(bounds)));
  };

  // Save as soon as a drag ends, so quitting while unlocked keeps the new spot.
  win.on('moved', () => {
    if (!locked) onPositionChange(currentPosition());
  });

  // While unlocked, only re-place when a display goes away; otherwise we'd yank the clock mid-drag.
  const onDisplayAdded = () => locked && place();
  const onDisplayMetricsChanged = () => locked && place();
  screen.on('display-added', onDisplayAdded);
  screen.on('display-removed', place);
  screen.on('display-metrics-changed', onDisplayMetricsChanged);

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('overlay:settings', getSettings());
    win.webContents.send('overlay:locked', locked);
  });

  win.on('closed', () => {
    clearInterval(topTimer);
    ipcMain.removeListener('overlay:size', onSize);
    screen.removeListener('display-added', onDisplayAdded);
    screen.removeListener('display-removed', place);
    screen.removeListener('display-metrics-changed', onDisplayMetricsChanged);
  });

  win.loadFile(path.join(__dirname, '../renderer/overlay/index.html'));

  return {
    window: win,
    applySettings(settings) {
      if (win.isDestroyed()) return;
      win.webContents.send('overlay:settings', settings);
    },
    isLocked: () => locked,
    setLocked(value) {
      if (value === locked || win.isDestroyed()) return;
      locked = value;
      // Switch click-through first so the clock never ends up "locked" but still catching clicks.
      win.setIgnoreMouseEvents(locked);
      win.webContents.send('overlay:locked', locked);
      if (locked) {
        onPositionChange(currentPosition());
        place(); // snap back inside the margins if it was dragged partly off-screen
      }
    },
    isHidden: () => hidden,
    setHidden(value) {
      if (win.isDestroyed()) return;
      hidden = value;
      if (hidden) win.hide();
      else if (size) show();
    },
    moveToDisplay(displayId) {
      onPositionChange({ ...getSettings().position, displayId });
      place();
    },
  };
}

module.exports = { createOverlay };
