const path = require('path');
const { app, WebContentsView, ipcMain, session, shell } = require('electron');
const { MEOWDB_HOME } = require('../../shared/defaults');
const { createAdBlocker } = require('../adblock');
const { createOverlayPanel, keepOnTop } = require('../overlay-panel');
const { isMeowdbUrl, classifyNavigation, isPermissionAllowed } = require('../panel-logic');

const MIN_SIZE = { width: 320, height: 300 };
const ERR_ABORTED = -3; // a navigation we cancelled ourselves, not a real failure

// The meowdb.com panel: an overlay panel holding the site in a view. See main.js for the tool interface.
function create(ctx) {
  const settings = ctx.getSettings;
  let loadError = null;

  // meowdb is remote content: no permissions beyond clipboard writes, and no downloads.
  const meowdbSession = session.fromPartition('persist:meowdb');
  meowdbSession.setPermissionRequestHandler((_wc, permission, callback) => callback(isPermissionAllowed(permission)));
  meowdbSession.setPermissionCheckHandler((_wc, permission) => isPermissionAllowed(permission));
  meowdbSession.on('will-download', (event) => event.preventDefault());
  const adBlocker = createAdBlocker(meowdbSession, path.join(app.getPath('userData'), 'adblock-engine.bin'));

  const view = new WebContentsView({
    webPreferences: { partition: 'persist:meowdb', sandbox: true, contextIsolation: true, nodeIntegration: false },
  });

  const panel = createOverlayPanel({
    ctx,
    idPrefix: 'panel',
    labels: { activate: 'Activate meowdb', deactivate: 'Deactivate meowdb', show: 'Show meowdb', hide: 'Hide meowdb' },
    pageFile: path.join(__dirname, '../../renderer/panel/frame.html'),
    preload: path.join(__dirname, '../../preload/panel-preload.js'),
    minSize: MIN_SIZE,
    // While the error card is up, shrink meowdb away so the card underneath shows.
    layoutContent: ({ width, height, top, bottom, border }) =>
      view.setBounds({ x: border, y: top, width: width - 2 * border, height: loadError ? 0 : Math.max(0, height - top - bottom) }),
    extraState: () => {
      const history = view.webContents.navigationHistory;
      return { canGoBack: history.canGoBack(), canGoForward: history.canGoForward(), loadError };
    },
    focusTarget: () => view.webContents,
  });
  const { win } = panel;
  win.contentView.addChildView(view);
  panel.layout();

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
  ipcMain.on('panel:nav', onNav);
  win.on('closed', () => ipcMain.removeListener('panel:nav', onNav));

  // Links: meowdb stays in the panel, sign-in popups open as in-app windows, other web links go
  // to the system browser. While passive the user can't have clicked anything, so a page script
  // (an ad, say) gets nothing: no popups, and no browser opening over the game.
  view.webContents.setWindowOpenHandler(({ url, disposition }) => {
    if (!panel.isActive()) return { action: 'deny' };
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
    if (target === 'external' && panel.isActive()) shell.openExternal(url);
  });

  const onNavigated = (_event, url) => {
    if (isMeowdbUrl(url)) ctx.saveSettings({ lastUrl: url });
    panel.pushState();
  };
  // A real page arrived, so any earlier load error is over. (did-finish-load can't be used for this:
  // it also fires for Chromium's built-in error page right after a failure.)
  view.webContents.on('did-navigate', () => {
    if (!loadError) return;
    loadError = null;
    panel.layout();
    panel.pushState();
  });
  view.webContents.on('did-navigate', onNavigated);
  view.webContents.on('did-navigate-in-page', onNavigated);
  view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return;
    loadError = description || `Error ${code}`;
    panel.layout();
    panel.pushState();
  });

  // Turn ad blocking on (if wanted) before the first page, so its ads never load.
  adBlocker.setEnabled(settings().blockAds).finally(() => view.webContents.loadURL(settings().lastUrl));

  return {
    window: win,
    shortcutHandlers: {
      'meowdb.toggleActive': panel.toggleActive,
      'meowdb.toggleHide': panel.toggleHidden,
    },
    trayItems: () => [...panel.trayItems(), { label: 'Go to meowdb home', click: () => view.webContents.loadURL(MEOWDB_HOME) }],
    applySettings(section, prev) {
      panel.applySettings(section, prev);
      if (section.blockAds !== prev.blockAds) adBlocker.setEnabled(section.blockAds).then(() => view.webContents.reload());
    },
    reshow: panel.reshow,
    onSecondInstance: panel.onSecondInstance,
  };
}

module.exports = { id: 'meowdb', create };
