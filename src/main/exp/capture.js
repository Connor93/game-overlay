const path = require('path');
const { BrowserWindow, desktopCapturer, ipcMain, screen, session, systemPreferences } = require('electron');

const PARTITION = 'exp-capture';

// Screen capture for the EXP tracker: a hidden page holds a stream of one display; on request it
// returns either the whole frame (to locate things) or just the given regions (to read them).
// Frames stay in memory and are only handed to the caller.
function createCapture() {
  let win = null;
  let displayId = null;
  let nextId = 1;
  const pending = new Map();

  const captureSession = session.fromPartition(PARTITION);
  captureSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    let source = null;
    try {
      // Fails without the Screen Recording permission on macOS.
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      source = sources.find((s) => String(s.display_id) === String(displayId)) || sources[0] || null;
    } catch {
      source = null;
    }
    try {
      callback(source ? { video: source } : {});
    } catch {
      // Electron throws when a request is answered with no stream; the page sees the rejection.
    }
  });

  const onFrame = (event, frame) => {
    if (!win || event.sender !== win.webContents) return;
    const done = pending.get(frame.id);
    if (!done) return;
    pending.delete(frame.id);
    done.resolve({
      width: frame.width,
      height: frame.height,
      parts: frame.parts.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) })),
    });
  };
  const onError = (event, message) => {
    if (!win || event.sender !== win.webContents) return;
    for (const { reject } of pending.values()) reject(new Error(message));
    pending.clear();
  };
  ipcMain.on('capture:frame', onFrame);
  ipcMain.on('capture:error', onError);

  function ensureWindow() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        partition: PARTITION,
        preload: path.join(__dirname, '../../preload/capture-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    win.loadFile(path.join(__dirname, '../../renderer/capture/capture.html'));
    return win;
  }

  // macOS needs the Screen Recording permission; elsewhere there's nothing to grant.
  const permission = () => (process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted');
  // macOS only asks (and lists the app under Screen Recording) once the app tries to capture.
  const requestPermission = () => desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});

  // Resolves to { width, height, parts: Img & {x, y}[] } in the display's physical pixels.
  async function grab(rects = null, timeoutMs = 10000) {
    if (permission() !== 'granted') throw Object.assign(new Error('no screen recording permission'), { code: 'no-permission' });
    const w = ensureWindow();
    if (w.webContents.isLoading()) await new Promise((resolve) => w.webContents.once('did-finish-load', resolve));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error('capture timed out'));
      }, timeoutMs);
      w.webContents.send('capture:grab', { id, rects });
    });
  }

  return {
    grab,
    // Which display to capture (null = primary). Switching restarts the stream.
    setDisplay(id) {
      const next = id ?? screen.getPrimaryDisplay().id;
      if (next === displayId) return;
      displayId = next;
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
    },
    displayId: () => displayId,
    stop() {
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
      for (const { reject } of pending.values()) reject(new Error('capture stopped'));
      pending.clear();
    },
    dispose() {
      this.stop();
      ipcMain.removeListener('capture:frame', onFrame);
      ipcMain.removeListener('capture:error', onError);
    },
    permission,
    requestPermission,
  };
}

module.exports = { createCapture };
