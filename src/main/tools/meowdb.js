const path = require('path');
const { app, BrowserWindow, WebContentsView, ipcMain, screen, session, shell } = require('electron');
const { MEOWDB_HOME } = require('../../shared/defaults');
const { createAdBlocker } = require('../adblock');
const { resolvePlacement, positionFromBounds, clampSize } = require('../placement');
const { ACTIVATE_GRACE_MS, isMeowdbUrl, classifyNavigation, shouldDropToPassive, isPermissionAllowed } = require('../panel-logic');

const TOP_LEVEL = 'screen-saver';
const REASSERT_TOP_MS = 2000;
const BORDER = 4;
const TOOLBAR = 32;
const STATUSBAR = 12;
const MIN_SIZE = { width: 320, height: 300 };
const BLUR_CHECK_MS = 100;
const REACTIVATE_GAME_MS = 50;
const ERR_ABORTED = -3; // a navigation we cancelled ourselves, not a real failure

function toDisplayInfo(display) {
  return { id: display.id, workArea: display.workArea, primary: display.id === screen.getPrimaryDisplay().id };
}

const keepOnTop = (win) => {
  win.setAlwaysOnTop(true, TOP_LEVEL);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
};

// The meowdb.com panel. Passive: see-through and click-through, keys go to the game.
// Active: highlighted, focused, with a toolbar, and movable/resizable. See main.js for the tool interface.
function create(ctx) {
  const settings = ctx.getSettings;
  let active = false;
  let hidden = settings().startHidden;
  let activatedAt = 0;
  let loadError = null;

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
    webPreferences: {
      preload: path.join(__dirname, '../../preload/panel-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  keepOnTop(win);
  win.setIgnoreMouseEvents(true);
  win.setOpacity(settings().opacity);
  win.on('system-context-menu', (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, '../../renderer/panel/frame.html'));

  // meowdb is remote content: no permissions beyond clipboard writes, and no downloads.
  const meowdbSession = session.fromPartition('persist:meowdb');
  meowdbSession.setPermissionRequestHandler((_wc, permission, callback) => callback(isPermissionAllowed(permission)));
  meowdbSession.setPermissionCheckHandler((_wc, permission) => isPermissionAllowed(permission));
  meowdbSession.on('will-download', (event) => event.preventDefault());
  const adBlocker = createAdBlocker(meowdbSession, path.join(app.getPath('userData'), 'adblock-engine.bin'));

  const view = new WebContentsView({
    webPreferences: { partition: 'persist:meowdb', sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.contentView.addChildView(view);

  // Something else (a game, another overlay) can take the top spot; keep claiming it.
  const topTimer = setInterval(() => win.setAlwaysOnTop(true, TOP_LEVEL), REASSERT_TOP_MS);

  function layout() {
    const [width, height] = win.getContentSize();
    const top = BORDER + (active ? TOOLBAR : 0);
    const bottom = BORDER + (active ? STATUSBAR : 0);
    // While the error card is up, shrink meowdb away so the card underneath shows.
    view.setBounds({ x: BORDER, y: top, width: width - 2 * BORDER, height: loadError ? 0 : Math.max(0, height - top - bottom) });
  }

  function pushState() {
    if (win.isDestroyed()) return;
    const history = view.webContents.navigationHistory;
    win.webContents.send('panel:state', {
      active,
      highlightColor: settings().highlightColor,
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      loadError,
    });
  }

  // Put the panel on its saved display (or the primary), at its saved size, fully on-screen.
  function place() {
    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const { position, size } = settings();
    const target = displays.find((d) => d.id === position.displayId) || displays.find((d) => d.primary);
    const fitted = clampSize(size, target.workArea, MIN_SIZE);
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
    view.webContents.focus();
    layout();
    pushState();
    ctx.refreshTray();
    // If focus never actually arrived (or left during the grace period), don't stay orange
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

  const onNav = (event, action) => {
    if (event.sender !== win.webContents) return;
    const history = view.webContents.navigationHistory;
    if (action === 'back' && history.canGoBack()) history.goBack();
    if (action === 'forward' && history.canGoForward()) history.goForward();
    if (action === 'home') view.webContents.loadURL(MEOWDB_HOME);
    if (action === 'reload') {
      if (loadError) view.webContents.loadURL(settings().lastUrl);
      else view.webContents.reload();
    }
  };
  const onResize = (event, size) => {
    if (event.sender !== win.webContents || !active) return;
    const { workArea } = screen.getDisplayMatching(win.getBounds());
    const fitted = clampSize(size, workArea, MIN_SIZE);
    win.setSize(Math.round(fitted.width), Math.round(fitted.height));
    layout();
  };
  const onResizeEnd = (event) => {
    if (event.sender === win.webContents && active) saveBounds();
  };
  ipcMain.on('panel:nav', onNav);
  ipcMain.on('panel:resize', onResize);
  ipcMain.on('panel:resize-end', onResizeEnd);

  // Links: meowdb stays in the panel, sign-in popups open as in-app windows, other web links go
  // to the system browser. While passive the user can't have clicked anything, so a page script
  // (an ad, say) gets nothing: no popups, and no browser opening over the game.
  view.webContents.setWindowOpenHandler(({ url, disposition }) => {
    if (!active) return { action: 'deny' };
    const target = classifyNavigation(url, disposition);
    if (target === 'panel') view.webContents.loadURL(url);
    if (target === 'external') shell.openExternal(url);
    if (target !== 'popup') return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { alwaysOnTop: true, parent: win, webPreferences: { partition: 'persist:meowdb' } },
    };
  });
  view.webContents.on('did-create-window', keepOnTop);
  view.webContents.on('will-navigate', (event, url) => {
    const target = classifyNavigation(url, 'default');
    if (target === 'panel') return;
    event.preventDefault();
    if (target === 'external' && active) shell.openExternal(url);
  });

  const onNavigated = (_event, url) => {
    if (isMeowdbUrl(url)) ctx.saveSettings({ lastUrl: url });
    pushState();
  };
  // A real page arrived, so any earlier load error is over. (did-finish-load can't be used for this:
  // it also fires for Chromium's built-in error page right after a failure.)
  view.webContents.on('did-navigate', () => {
    if (!loadError) return;
    loadError = null;
    layout();
    pushState();
  });
  view.webContents.on('did-navigate', onNavigated);
  view.webContents.on('did-navigate-in-page', onNavigated);
  view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return;
    loadError = description || `Error ${code}`;
    layout();
    pushState();
  });

  const onDisplayChange = () => !active && place();
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, onDisplayChange);

  win.webContents.on('did-finish-load', pushState);
  win.on('closed', () => {
    clearInterval(topTimer);
    app.removeListener('browser-window-blur', onAnyBlur);
    ipcMain.removeListener('panel:nav', onNav);
    ipcMain.removeListener('panel:resize', onResize);
    ipcMain.removeListener('panel:resize-end', onResizeEnd);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.removeListener(event, onDisplayChange);
    }
  });

  place();
  // Turn ad blocking on (if wanted) before the first page, so its ads never load.
  adBlocker.setEnabled(settings().blockAds).finally(() => view.webContents.loadURL(settings().lastUrl));
  if (!hidden) win.once('ready-to-show', show);

  const shortcutHandlers = {
    'meowdb.toggleActive': () => (active ? deactivate({ handBackFocus: true }) : activate()),
    'meowdb.toggleHide': () => setHidden(!hidden),
  };

  return {
    window: win,
    shortcutHandlers,
    // Each item does what its label says, even if the state changed while the menu was open
    // (on Windows, clicking the tray can itself drop the panel to passive).
    trayItems: () => [
      active
        ? { label: 'Deactivate meowdb', click: () => deactivate({ handBackFocus: true }) }
        : { label: 'Activate meowdb', click: () => !active && activate() },
      hidden
        ? { label: 'Show meowdb', click: () => setHidden(false) }
        : { label: 'Hide meowdb', click: () => setHidden(true) },
      { label: 'Go to meowdb home', click: () => view.webContents.loadURL(MEOWDB_HOME) },
    ],
    applySettings(section, prev) {
      pushState();
      if (section.blockAds !== prev.blockAds) adBlocker.setEnabled(section.blockAds).then(() => view.webContents.reload());
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

module.exports = { id: 'meowdb', create };
