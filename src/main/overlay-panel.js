const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { resolvePlacement, positionFromBounds, clampSize } = require('./placement');
const { ACTIVATE_GRACE_MS, shouldDropToPassive } = require('./panel-logic');

const TOP_LEVEL = 'screen-saver';
const REASSERT_TOP_MS = 2000;
const BORDER = 4;
const TOOLBAR = 32;
const STATUSBAR = 12;
const BLUR_CHECK_MS = 100;
const REACTIVATE_GAME_MS = 50;
const DISPLAY_EVENTS = ['display-added', 'display-removed', 'display-metrics-changed'];

function toDisplayInfo(display) {
  return { id: display.id, workArea: display.workArea, primary: display.id === screen.getPrimaryDisplay().id };
}

const keepOnTop = (win) => {
  win.setAlwaysOnTop(true, TOP_LEVEL);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
};

// A floating overlay panel shared by tools (meowdb, EXP tracker). Passive: see-through and
// click-through, keys go to the game. Active: highlighted, focused, with a toolbar, movable and
// resizable. The tool supplies the page and anything inside it.
//
// options:
//   ctx          the tool context (getSettings/saveSettings/refreshTray/reshowOverlays); its settings
//                section needs startHidden, opacity, highlightColor, size, position
//   idPrefix     IPC channel prefix: `${idPrefix}:state`, `${idPrefix}:resize`, `${idPrefix}:resize-end`
//   labels       { activate, deactivate, show, hide } for the tray
//   pageFile     the panel's HTML page; preload: its preload script (must expose the shell API)
//   minSize      smallest allowed size
//   layoutContent({ width, height, top, bottom, active })  optional: position child views
//   extraState() optional: tool fields merged into every state push
//   focusTarget()  optional: webContents to focus on activate (defaults to the page)
function createOverlayPanel({ ctx, idPrefix, labels, pageFile, preload, minSize, layoutContent, extraState, focusTarget }) {
  const settings = ctx.getSettings;
  let active = false;
  let hidden = settings().startHidden;
  let activatedAt = 0;

  const win = new BrowserWindow({
    width: settings().size.width,
    height: settings().size.height,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    // A drag region acts like a title bar on Windows; don't let its menu close or minimize the panel.
    closable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  keepOnTop(win);
  win.setIgnoreMouseEvents(true);
  win.setOpacity(settings().opacity);
  win.on('system-context-menu', (event) => event.preventDefault());
  win.loadFile(pageFile);

  // Something else (a game, another overlay) can take the top spot; keep claiming it.
  const topTimer = setInterval(() => win.setAlwaysOnTop(true, TOP_LEVEL), REASSERT_TOP_MS);

  function layout() {
    if (!layoutContent || win.isDestroyed()) return;
    const [width, height] = win.getContentSize();
    layoutContent({
      width,
      height,
      top: BORDER + (active ? TOOLBAR : 0),
      bottom: BORDER + (active ? STATUSBAR : 0),
      border: BORDER,
      active,
    });
  }

  function pushState() {
    if (win.isDestroyed()) return;
    win.webContents.send(`${idPrefix}:state`, {
      active,
      highlightColor: settings().highlightColor,
      ...(extraState ? extraState() : {}),
    });
  }

  // Put the panel on its saved display (or the primary), at its saved size, fully on-screen.
  function place() {
    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const { position, size } = settings();
    const target = displays.find((d) => d.id === position.displayId) || displays.find((d) => d.primary);
    const fitted = clampSize(size, target.workArea, minSize);
    const { x, y } = resolvePlacement(position, displays, fitted);
    win.setBounds({ x, y, width: fitted.width, height: fitted.height });
    layout();
  }

  function saveBounds() {
    const bounds = win.getBounds();
    ctx.saveSettings({
      position: positionFromBounds(bounds, toDisplayInfo(screen.getDisplayMatching(bounds))),
      size: { width: bounds.width, height: bounds.height },
    });
  }

  function show() {
    win.showInactive();
    win.setAlwaysOnTop(true, TOP_LEVEL);
  }

  function activate() {
    if (hidden) setHidden(false);
    active = true;
    activatedAt = Date.now();
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.setOpacity(1);
    if (process.platform === 'darwin') app.focus({ steal: true });
    win.focus();
    (focusTarget ? focusTarget() : win.webContents).focus();
    layout();
    pushState();
    ctx.refreshTray();
    // If focus never actually arrived (or left during the grace period), don't stay highlighted
    // while keys go elsewhere.
    setTimeout(checkFocus, ACTIVATE_GRACE_MS + BLUR_CHECK_MS);
  }

  // handBackFocus: true when the user asked to go back to the game (shortcut, tray, hide), so we
  // actively give focus back. false when focus already left on its own (they clicked the game).
  function deactivate({ handBackFocus }) {
    if (!active) return;
    active = false;
    saveBounds();
    win.setIgnoreMouseEvents(true);
    win.setOpacity(settings().opacity);
    if (handBackFocus) win.blur();
    win.setFocusable(false);
    if (handBackFocus && process.platform === 'darwin') {
      // Hiding the app hands activation back to the previous app (the game); then put the overlays back.
      app.hide();
      setTimeout(ctx.reshowOverlays, REACTIVATE_GAME_MS);
    }
    layout();
    pushState();
    ctx.refreshTray();
  }

  function setHidden(value) {
    if (value === hidden || win.isDestroyed()) return;
    hidden = value;
    if (hidden) {
      deactivate({ handBackFocus: true });
      win.hide();
    } else {
      show();
    }
    ctx.refreshTray();
  }

  // Clicking the game (or switching apps) while active drops the panel to passive. Focus moving to
  // our own Settings window or a login popup doesn't count.
  function checkFocus() {
    const drop = shouldDropToPassive({
      active,
      ownWindowFocused: BrowserWindow.getFocusedWindow() !== null,
      msSinceActivate: Date.now() - activatedAt,
    });
    if (drop) deactivate({ handBackFocus: false });
  }
  const onAnyBlur = () => setTimeout(checkFocus, BLUR_CHECK_MS);
  app.on('browser-window-blur', onAnyBlur);

  win.on('moved', () => active && saveBounds());

  const onResize = (event, size) => {
    if (event.sender !== win.webContents || !active) return;
    const { workArea } = screen.getDisplayMatching(win.getBounds());
    const fitted = clampSize(size, workArea, minSize);
    win.setSize(Math.round(fitted.width), Math.round(fitted.height));
    layout();
  };
  const onResizeEnd = (event) => {
    if (event.sender === win.webContents && active) saveBounds();
  };
  ipcMain.on(`${idPrefix}:resize`, onResize);
  ipcMain.on(`${idPrefix}:resize-end`, onResizeEnd);

  const onDisplayChange = () => !active && place();
  for (const event of DISPLAY_EVENTS) screen.on(event, onDisplayChange);

  win.webContents.on('did-finish-load', pushState);
  win.on('closed', () => {
    clearInterval(topTimer);
    app.removeListener('browser-window-blur', onAnyBlur);
    ipcMain.removeListener(`${idPrefix}:resize`, onResize);
    ipcMain.removeListener(`${idPrefix}:resize-end`, onResizeEnd);
    for (const event of DISPLAY_EVENTS) screen.removeListener(event, onDisplayChange);
  });

  place();
  if (!hidden) win.once('ready-to-show', show);

  return {
    win,
    isActive: () => active,
    isHidden: () => hidden,
    activate,
    deactivate,
    setHidden,
    place,
    layout,
    pushState,
    toggleActive: () => (active ? deactivate({ handBackFocus: true }) : activate()),
    toggleHidden: () => setHidden(!hidden),
    // Each item does what its label says, even if the state changed while the menu was open
    // (on Windows, clicking the tray can itself drop the panel to passive).
    trayItems: () => [
      active
        ? { label: labels.deactivate, click: () => deactivate({ handBackFocus: true }) }
        : { label: labels.activate, click: () => !active && activate() },
      hidden ? { label: labels.show, click: () => setHidden(false) } : { label: labels.hide, click: () => setHidden(true) },
    ],
    // Shared settings: highlight, passive opacity, and position/size (e.g. after a reset).
    applySettings(section, prev) {
      pushState();
      if (!active) win.setOpacity(section.opacity);
      const moved = JSON.stringify([section.position, section.size]) !== JSON.stringify([prev.position, prev.size]);
      if (moved) place();
    },
    reshow() {
      if (!hidden && !win.isDestroyed()) show();
    },
    onSecondInstance: () => setHidden(false),
  };
}

module.exports = { createOverlayPanel, keepOnTop };
