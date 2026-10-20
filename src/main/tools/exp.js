const path = require('path');
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const { createOverlayPanel } = require('../overlay-panel');
const { createCapture } = require('../exp/capture');
const { createOcr } = require('../exp/ocr');
const { createReader } = require('../exp/reader');
const { loadHistory, saveHistory, renameSession, deleteSession } = require('../exp/history-store');
const { createValidator } = require('../../shared/exp/validator');
const { createSessionMachine } = require('../../shared/exp/session');
const { sessionStats, summarizeHistory } = require('../../shared/exp/stats');
const img = require('../exp/image');

const SAMPLE_MS = 4000;
const READ_MAP_EVERY = 3; // ticks
const RELOCATE_AFTER_MISSES = 5;
const LOCATE_RETRY_MS = 30000; // looking for the bar is a full-screen scan: not every tick
const READING_HINT_AFTER_REJECTS = 3;
const MIN_SIZE = { width: 220, height: 200 };
const PERMISSION_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// The EXP tracker: reads EXP and the map name off the screen and turns them into sessions.
// See main.js for the tool interface.
function create(ctx) {
  const settings = ctx.getSettings;
  const historyPath = path.join(app.getPath('userData'), 'exp-sessions.json');
  let history = loadHistory(historyPath);
  let tab = 'live';
  let openMap = null;
  let hint = null;
  let tickCount = 0;
  let misses = 0;
  let rejects = 0; // readings in a row the validator didn't trust
  let nextLocateAt = 0;
  let lastVerdict = null;
  let busy = false;
  let askedPermission = false;

  const capture = createCapture();
  const ocr = createOcr();
  const reader = createReader(ocr);
  const validator = createValidator();
  const machine = createSessionMachine({
    autoStart: settings().autoStart,
    onSave(session) {
      history = [...history, session];
      saveHistory(historyPath, history);
    },
  });

  const panel = createOverlayPanel({
    ctx,
    idPrefix: 'exp',
    labels: { activate: 'Activate EXP tracker', deactivate: 'Deactivate EXP tracker', show: 'Show EXP tracker', hide: 'Hide EXP tracker' },
    pageFile: path.join(__dirname, '../../renderer/exp/index.html'),
    preload: path.join(__dirname, '../../preload/exp-preload.js'),
    minSize: MIN_SIZE,
    extraState,
  });
  const { win } = panel;

  function extraState() {
    const m = machine.state();
    const session = m.session;
    const stats = session
      ? { ...sessionStats(session, { now: Date.now(), exp: m.lastExp, required: lastVerdict && lastVerdict.required }), gainedExp: session.gainedExp }
      : null;
    return {
      tab: panel.isActive() ? tab : 'live',
      status: m.status,
      autoStartArmed: m.autoStartArmed && m.autoStartEnabled,
      map: session ? session.map : m.map && m.map.map,
      street: session ? session.street : m.map && m.map.street,
      pct: m.lastPct,
      stats,
      hint,
      needsMapName: m.needsMapName,
      history: summarizeHistory(history),
      openMap,
      mapSessions: openMap ? history.filter((s) => s.map === openMap).sort((a, b) => b.startedAt - a.startedAt) : null,
    };
  }

  // --- sampling ---

  function displayFor(regions) {
    const displays = screen.getAllDisplays();
    return (regions && displays.find((d) => d.id === regions.displayId)) || screen.getPrimaryDisplay();
  }

  // Our visible windows (panels, the clock) on a display, in that display's capture pixels.
  function ourWindowRects(display) {
    const s = display.scaleFactor;
    return BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && w.isVisible())
      .map((w) => w.getBounds())
      .map((b) => ({ x: (b.x - display.bounds.x) * s, y: (b.y - display.bounds.y) * s, width: b.width * s, height: b.height * s }));
  }

  // Our own windows can sit over the game's text; don't read through them.
  const coveredByOurWindows = (rect, display) => ourWindowRects(display).some((r) => overlaps(rect, r));

  async function locate() {
    // Try each display in turn until the EXP bar turns up.
    const displays = screen.getAllDisplays();
    const start = displays.findIndex((d) => d.id === capture.displayId());
    for (let i = 0; i < displays.length; i++) {
      const display = displays[(start + 1 + i) % displays.length];
      capture.setDisplay(display.id);
      const frame = (await capture.grab(null)).parts[0];
      // Our overlays often sit in the black bars beside the game; blank them so they don't look like game.
      for (const r of ourWindowRects(display)) img.fillRect(frame, r, 0);
      const found = await reader.locate(frame);
      if (found) {
        ctx.saveSettings({ regions: { displayId: display.id, ...found } });
        return settings().regions;
      }
    }
    return null;
  }

  // The bar was lost or is being looked for again: the next reading is a new baseline (it may be
  // another character, or a different screen), not a gain.
  function forgetPosition() {
    validator.reset();
    machine.forgetExp();
    lastVerdict = null;
    rejects = 0;
    nextLocateAt = 0;
  }

  async function sample() {
    const t = Date.now();
    let regions = settings().regions;
    if (!regions) {
      if (t < nextLocateAt) {
        hint = 'cant-find';
        return;
      }
      hint = 'locating';
      panel.pushState();
      regions = await locate();
      if (!regions) {
        hint = 'cant-find';
        nextLocateAt = t + LOCATE_RETRY_MS;
        return;
      }
    }
    const display = displayFor(regions);
    capture.setDisplay(display.id);

    const expCovered = coveredByOurWindows(regions.exp, display);
    const wantMap = regions.map && (tickCount % READ_MAP_EVERY === 0 || machine.state().needsMapName);
    const mapCovered = wantMap && coveredByOurWindows(regions.map, display);
    const rects = [expCovered ? null : regions.exp, wantMap && !mapCovered ? regions.map : null];
    const frame = await capture.grab(rects.filter(Boolean));
    const parts = rects.map((r) => (r ? frame.parts.shift() : null));
    const local = (part, rect) => ({ ...rect, x: rect.x - part.x, y: rect.y - part.y });

    let verdict = null;
    if (parts[0]) {
      const reading = await reader.readExp(parts[0], { exp: local(parts[0], regions.exp), textHeight: regions.textHeight, scale: regions.scale });
      if (reading) {
        misses = 0;
        verdict = validator.accept(reading);
        if (verdict.status === 'reject') rejects += 1;
        else {
          rejects = 0;
          lastVerdict = verdict;
        }
      } else if (++misses >= RELOCATE_AFTER_MISSES) {
        // The bar may have moved (resolution change, different display): find it again.
        misses = 0;
        ctx.saveSettings({ regions: null });
        forgetPosition();
      }
    }
    // A map name only counts when the EXP bar read too: proof the game itself is on screen, not
    // some other window whose text happens to sit where the minimap would be.
    const map =
      parts[1] && verdict ? await reader.readMap(parts[1], { map: local(parts[1], regions.map), textHeight: regions.textHeight }) : null;

    machine.sample({ t, verdict, map });
    machine.tick(t);
    hint = expCovered || mapCovered ? 'covered' : misses >= 2 ? 'cant-read' : rejects >= READING_HINT_AFTER_REJECTS ? 'reading' : null;
  }

  async function onTick() {
    if (busy) return;
    const tracking = machine.state().status !== 'idle';
    if (panel.isHidden() && !tracking) {
      capture.stop(); // nothing to show and nothing to record: let go of the screen
      return;
    }
    busy = true;
    tickCount += 1;
    try {
      const permission = capture.permission();
      if (permission !== 'granted') {
        hint = 'no-permission';
        if (permission === 'not-determined' && !askedPermission) {
          askedPermission = true;
          capture.requestPermission();
        }
      } else {
        await sample();
      }
    } catch (err) {
      hint = err.code === 'no-permission' ? 'no-permission' : 'cant-read';
      if (err.code !== 'no-permission') console.error(`EXP tracker: ${err.message}`);
    } finally {
      busy = false;
      machine.tick(Date.now());
      panel.pushState();
    }
  }
  const timer = setInterval(onTick, SAMPLE_MS);
  setTimeout(onTick, 1500);

  // --- panel actions ---

  function startStop() {
    const t = Date.now();
    if (machine.state().status === 'idle') machine.start(t);
    else machine.stop(t);
    panel.pushState();
    ctx.refreshTray();
  }

  // Panel buttons only work while the panel is active (passive is click-through anyway).
  const handlers = {
    'exp:start-stop': startStop,
    'exp:tab': (value) => {
      tab = value === 'history' ? 'history' : 'live';
      openMap = null;
    },
    'exp:open-map': (name) => {
      openMap = typeof name === 'string' ? name : null;
    },
    'exp:name-map': (name) => typeof name === 'string' && machine.nameMap(name),
    'exp:rename': ({ id, map } = {}) => {
      if (typeof id !== 'string' || typeof map !== 'string' || !map.trim()) return;
      history = renameSession(history, id, map.trim());
      saveHistory(historyPath, history);
      openMap = map.trim(); // follow the session to its new name
    },
    'exp:delete': (id) => {
      if (typeof id !== 'string') return;
      history = deleteSession(history, id);
      saveHistory(historyPath, history);
      if (openMap && !history.some((s) => s.map === openMap)) openMap = null;
    },
    'exp:permission-settings': () => {
      if (process.platform !== 'darwin') return;
      capture.requestPermission(); // makes sure Game Overlay is in the list to switch on
      shell.openExternal(PERMISSION_PANE);
    },
    'exp:relocate': () => {
      ctx.saveSettings({ regions: null });
      forgetPosition();
    },
  };
  const listeners = Object.entries(handlers).map(([channel, fn]) => {
    const listener = (event, arg) => {
      if (event.sender !== win.webContents || !panel.isActive()) return;
      fn(arg);
      panel.pushState();
    };
    ipcMain.on(channel, listener);
    return [channel, listener];
  });

  // Quitting saves the open session (if it's long enough to keep).
  const onBeforeQuit = () => machine.quit(Date.now());
  app.on('before-quit', onBeforeQuit);

  win.on('closed', () => {
    clearInterval(timer);
    for (const [channel, listener] of listeners) ipcMain.removeListener(channel, listener);
    app.removeListener('before-quit', onBeforeQuit);
    capture.dispose();
    ocr.terminate();
  });

  return {
    window: win,
    shortcutHandlers: {
      'exp.toggleActive': panel.toggleActive,
      'exp.toggleHide': panel.toggleHidden,
      'exp.startStop': startStop,
    },
    trayItems: () => [
      ...panel.trayItems(),
      machine.state().status === 'idle'
        ? { label: 'Start EXP session', click: () => machine.state().status === 'idle' && startStop() }
        : { label: 'Stop EXP session', click: () => machine.state().status !== 'idle' && startStop() },
    ],
    applySettings(section, prev) {
      panel.applySettings(section, prev);
      if (section.autoStart !== prev.autoStart) machine.setAutoStart(section.autoStart);
      if (prev.regions && !section.regions) forgetPosition(); // Settings → Find EXP bar again
    },
    reshow: panel.reshow,
    onSecondInstance: panel.onSecondInstance,
    // For manual testing through the debug hook.
    debug: { machine, validator, reader, capture, sample: onTick },
  };
}

module.exports = { id: 'exp', create };
