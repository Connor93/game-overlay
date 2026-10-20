# Overlay Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone macOS + Windows Electron app that shows local time as outlined text on a transparent, click-through, always-on-top window (including over full-screen games), with a tray/menu-bar settings window, shortcut-driven move/hide, and multi-monitor support.

**Architecture:** Pure logic (time formatting, settings normalization, on-screen placement, shortcut recording) lives in small dependency-free CommonJS modules under `src/shared` and `src/main/*-logic` files, which are unit-tested with Vitest. Thin Electron glue (overlay window, tray, settings window, shortcuts) wires that logic to the OS and is verified by hand. The overlay renderer measures its own text and asks main to resize the window, so the clock always fits on one line.

**Tech Stack:** Electron (current stable, `npm i -D electron@latest`), electron-builder, Vitest, plain HTML/CSS/JS renderers (no framework), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-20-overlay-clock-design.md`

## Global Constraints

- Never inject into, hook, read memory of, or attach to any other process. Plain top-most window only.
- The overlay window must never take keyboard focus and in locked mode must pass all clicks through.
- Overlay window options proven by the spike: `transparent: true, frame: false, hasShadow: false, resizable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true`; then `setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, `setIgnoreMouseEvents(true)`, re-assert `setAlwaysOnTop(true, 'screen-saver')` every 2000 ms; `app.dock.hide()` on macOS.
- Time is always rendered on ONE line; window is sized to the rendered text.
- Defaults: font `-apple-system, "Segoe UI", sans-serif`, bold, size 64 px, color `#ffffff`, outline `#000000` 3 px (`-webkit-text-stroke` + `paint-order: stroke fill`), seconds on, 12-hour, opacity 1, top-right of primary work area, 20 px margins.
- No Dock icon; no taskbar entry for the overlay.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, preload scripts expose a minimal API via `contextBridge`.
- Distribution: unsigned (no paid certs), macOS ad-hoc signed (`identity: "-"`), universal macOS build, Windows NSIS installer + portable exe, built by GitHub Actions and attached to a GitHub Release. Public repo. **Ask the user before creating the GitHub repo or pushing.**

## Review Focus

1. **Corrupt, missing, or partially-written `settings.json`** → app starts with defaults (keeping any valid fields), never crashes. Pinned in Task 2.
2. **The clock's monitor is unplugged (at launch or while running)** → clock moves to the primary display at the same relative position, fully on-screen. Pinned in Task 3 (logic) and Task 4 (event wiring).
3. **Text larger than the display** (huge font on a small screen) → window clamped to the work-area origin, never negative/off-screen. Pinned in Task 3.
4. **A chosen shortcut is invalid or already taken by another app** → registration failure reported in settings, previous shortcut kept, tray menu still works. Pinned in Task 6 (logic) and Task 5 (registration).
5. **The app is launched twice** → second instance exits; only one clock. Pinned in Task 4 (manual check).

---

## File Structure

```
overlay-clock/
  package.json
  electron-builder.yml
  vitest.config.js
  README.md
  .github/workflows/release.yml
  build/icon.png                 (app icon, 512x512)
  build/trayTemplate.png         (16x16 + @2x, monochrome, macOS template)
  src/
    shared/
      defaults.js                DEFAULT_SETTINGS
      format-time.js             formatTime() — UMD: works via require() and <script>
    main/
      main.js                    app lifecycle, single-instance lock, wiring
      settings-store.js          normalizeSettings(), loadSettings(), saveSettings()
      placement.js               resolvePlacement(), relativeFromBounds()
      overlay-window.js          createOverlay(), lock/unlock/hide, resize, re-placement
      shortcuts.js               registerShortcuts()
      tray.js                    createTray()
      settings-window.js         openSettingsWindow()
    preload/
      overlay-preload.js
      settings-preload.js
    renderer/
      overlay/index.html, overlay.css, overlay.js
      settings/index.html, settings.css, settings.js, accelerator.js
  tests/
    format-time.test.js
    settings-store.test.js
    placement.test.js
    accelerator.test.js
```

## Shared Types (referenced by every task)

```js
// Settings — as stored in <userData>/settings.json
{
  fontFamily: string,      // CSS font-family
  fontWeight: number,      // 100..900, default 700
  fontSize: number,        // px, clamp 8..400, default 64
  color: string,           // #rrggbb, default '#ffffff'
  outlineColor: string,    // #rrggbb, default '#000000'
  outlineWidth: number,    // px, clamp 0..20, default 3
  opacity: number,         // clamp 0.1..1, default 1
  showSeconds: boolean,    // default true
  hour12: boolean,         // default true
  shortcutToggleLock: string,   // Electron accelerator, default 'Control+Alt+C'
  shortcutToggleHide: string,   // default 'Control+Alt+H'
  openAtLogin: boolean,    // default false
  position: { displayId: number|null, relX: number, relY: number } // rel clamp 0..1, default { displayId: null, relX: 1, relY: 0 }
}
// displayId null = primary display.
```

---

### Task 1: Scaffold and time formatting

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`, `src/shared/defaults.js`, `src/shared/format-time.js`
- Test: `tests/format-time.test.js`

**Interfaces:**
- Produces: `formatTime(date: Date, opts: { showSeconds: boolean, hour12: boolean }) -> string`; `DEFAULT_SETTINGS` (shape above) exported from `src/shared/defaults.js`.
- `format-time.js` must be UMD: `module.exports = { formatTime }` under CommonJS, and `globalThis.OverlayClock = { formatTime }` when loaded via `<script>` in a sandboxed renderer.

- [ ] **Step 1: Scaffold** — `npm init -y`; set `"main": "src/main/main.js"`, scripts `"start": "electron ."`, `"test": "vitest run"`, `"dist": "electron-builder"`; `npm i -D electron@latest electron-builder@latest vitest@latest`. `.gitignore`: `node_modules/`, `dist/`.

- [ ] **Step 2: Write the failing tests** (`tests/format-time.test.js`)

```js
const { formatTime } = require('../src/shared/format-time');
const d = new Date(2026, 9, 20, 15, 4, 9); // 3:04:09 PM local
test('12h with seconds', () => expect(formatTime(d, { showSeconds: true, hour12: true })).toBe('03:04:09 PM'));
test('12h no seconds',   () => expect(formatTime(d, { showSeconds: false, hour12: true })).toBe('03:04 PM'));
test('24h with seconds', () => expect(formatTime(d, { showSeconds: true, hour12: false })).toBe('15:04:09'));
test('midnight 24h is 00', () => expect(formatTime(new Date(2026, 0, 1, 0, 0, 0), { showSeconds: false, hour12: false })).toBe('00:00'));
test('midnight 12h is 12 AM', () => expect(formatTime(new Date(2026, 0, 1, 0, 5, 0), { showSeconds: false, hour12: true })).toBe('12:05 AM'));
test('noon 12h is 12 PM', () => expect(formatTime(new Date(2026, 0, 1, 12, 0, 0), { showSeconds: false, hour12: true })).toBe('12:00 PM'));
```

- [ ] **Step 3: Run** `npx vitest run tests/format-time.test.js` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `formatTime`** — build the string by hand from `getHours/getMinutes/getSeconds` with zero-padding and `AM`/`PM` (do NOT use `toLocaleTimeString`; its output varies by OS locale, e.g. `p.m.` or a narrow no-break space). Also write `DEFAULT_SETTINGS` in `src/shared/defaults.js` with the exact defaults from Shared Types.

- [ ] **Step 5: Run** `npx vitest run` — Expected: 6 passed.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: scaffold project and time formatting"`

---

### Task 2: Settings store

**Files:**
- Create: `src/main/settings-store.js`
- Test: `tests/settings-store.test.js`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`.
- Produces:
  - `normalizeSettings(raw: unknown) -> Settings` — pure. Starts from defaults; copies each field from `raw` only if it has the right type/format; clamps numeric ranges; colors must match `/^#[0-9a-f]{6}$/i`; strings non-empty; `position.displayId` must be a number or null.
  - `loadSettings(filePath: string) -> Settings` — reads + `JSON.parse` + normalize; on missing file or parse error returns `normalizeSettings({})`.
  - `saveSettings(filePath: string, settings: Settings) -> void` — writes to `filePath + '.tmp'` then `fs.renameSync` onto `filePath` (atomic, so a crash mid-write can't corrupt it).

- [ ] **Step 1: Write the failing tests**

```js
const os = require('os'), fs = require('fs'), path = require('path');
const { normalizeSettings, loadSettings, saveSettings } = require('../src/main/settings-store');
const { DEFAULT_SETTINGS } = require('../src/shared/defaults');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oc-')), 'settings.json');

test('empty input gives defaults', () => expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS));
test('non-object input gives defaults', () => expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS));
test('keeps valid fields, drops invalid ones', () => {
  const s = normalizeSettings({ fontSize: 100, color: 'red', outlineWidth: 'x' });
  expect(s.fontSize).toBe(100); expect(s.color).toBe('#ffffff'); expect(s.outlineWidth).toBe(3);
});
test('clamps ranges', () => {
  const s = normalizeSettings({ fontSize: 9999, outlineWidth: -4, opacity: 0, position: { displayId: 5, relX: 3, relY: -1 } });
  expect(s.fontSize).toBe(400); expect(s.outlineWidth).toBe(0); expect(s.opacity).toBe(0.1);
  expect(s.position).toEqual({ displayId: 5, relX: 1, relY: 0 });
});
test('missing file gives defaults', () => expect(loadSettings(tmp())).toEqual(DEFAULT_SETTINGS));
test('corrupt file gives defaults', () => { const f = tmp(); fs.writeFileSync(f, '{"fontSize": 80,'); expect(loadSettings(f)).toEqual(DEFAULT_SETTINGS); });
test('save then load round-trips', () => {
  const f = tmp(); const s = { ...DEFAULT_SETTINGS, fontSize: 90, hour12: false };
  saveSettings(f, s); expect(loadSettings(f)).toEqual(s); expect(fs.existsSync(f + '.tmp')).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/settings-store.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the three functions as specified above.
- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -am "feat: settings store with validation and atomic save"` (add new files first).

---

### Task 3: Placement logic

**Files:**
- Create: `src/main/placement.js`
- Test: `tests/placement.test.js`

**Interfaces:**
- Types: `Rect = {x,y,width,height}`; `DisplayInfo = { id: number, workArea: Rect, primary: boolean }`.
- Produces:
  - `MARGIN = 20`
  - `resolvePlacement(position: Settings['position'], displays: DisplayInfo[], size: {width,height}) -> { x: number, y: number, displayId: number }`
    — pick the display whose `id === position.displayId`; if `displayId` is null or not found, the primary. Then:
    ```
    rangeX = max(0, wa.width  - size.width  - 2*MARGIN)
    rangeY = max(0, wa.height - size.height - 2*MARGIN)
    x = round(wa.x + MARGIN + relX*rangeX),  y = round(wa.y + MARGIN + relY*rangeY)
    ```
    If the window is wider/taller than `wa - 2*MARGIN`, use `wa.x`/`wa.y` for that axis (no margin) so as much as possible stays visible.
  - `relativeFromBounds(bounds: Rect, display: DisplayInfo) -> { displayId, relX, relY }` — inverse of the above, clamped to 0..1; when range is 0 the rel value is 0.
  - Because `relX = 1` keeps the right edge pinned, a growing clock in the top-right grows leftward. No extra anchoring logic is needed.

- [ ] **Step 1: Write the failing tests**

```js
const { resolvePlacement, relativeFromBounds } = require('../src/main/placement');
const primary = { id: 1, primary: true,  workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const second  = { id: 2, primary: false, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } };
const size = { width: 400, height: 100 };

test('default is top-right of primary with 20px margins', () =>
  expect(resolvePlacement({ displayId: null, relX: 1, relY: 0 }, [primary, second], size)).toEqual({ x: 1020, y: 45, displayId: 1 }));
test('targets the chosen display', () =>
  expect(resolvePlacement({ displayId: 2, relX: 0, relY: 1 }, [primary, second], size)).toEqual({ x: 1460, y: 960, displayId: 2 }));
test('missing display falls back to primary, same relative spot', () =>
  expect(resolvePlacement({ displayId: 99, relX: 0, relY: 1 }, [primary], size)).toEqual({ x: 20, y: 780, displayId: 1 }));
test('oversized window is pinned to work-area origin, not off-screen', () =>
  expect(resolvePlacement({ displayId: null, relX: 1, relY: 1 }, [primary], { width: 3000, height: 2000 })).toEqual({ x: 0, y: 25, displayId: 1 }));
test('relativeFromBounds inverts resolvePlacement', () => {
  const p = resolvePlacement({ displayId: 2, relX: 0.25, relY: 0.5 }, [primary, second], size);
  expect(relativeFromBounds({ x: p.x, y: p.y, ...size }, second)).toEqual({ displayId: 2, relX: 0.25, relY: 0.5 });
});
test('relativeFromBounds clamps a window dragged partly off-screen', () =>
  expect(relativeFromBounds({ x: 5000, y: -50, ...size }, second)).toEqual({ displayId: 2, relX: 1, relY: 0 }));
```

- [ ] **Step 2: Run** `npx vitest run tests/placement.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** both functions per the formulas above.
- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: display-aware placement logic"`

---

### Task 4: Overlay window (renders, auto-sizes, places, survives monitor changes)

**Files:**
- Create: `src/main/main.js`, `src/main/overlay-window.js`, `src/preload/overlay-preload.js`, `src/renderer/overlay/{index.html,overlay.css,overlay.js}`

**Interfaces:**
- Consumes: `loadSettings`, `saveSettings`, `resolvePlacement`, `relativeFromBounds`, `formatTime`.
- Produces (from `overlay-window.js`):
  - `createOverlay(getSettings: () => Settings, onPositionChange: (pos) => void) -> Overlay`
  - `Overlay = { applySettings(s: Settings), setLocked(locked: boolean), isLocked(): boolean, setHidden(hidden: boolean), isHidden(): boolean, moveToDisplay(displayId: number|null), window: BrowserWindow }`
- IPC contract (overlay preload exposes `window.overlayApi`):
  - main → renderer `'overlay:settings'` (Settings); `'overlay:locked'` (boolean)
  - renderer → main `'overlay:size'` ({width, height}) — sent after every render that changes the measured size.
- Settings path: `path.join(app.getPath('userData'), 'settings.json')`.

- [ ] **Step 1: Overlay renderer.** `index.html` loads `../../shared/format-time.js` then `overlay.js` via plain `<script>` tags. CSP meta: `default-src 'self'; style-src 'self' 'unsafe-inline'`. One element `#clock` with `white-space: nowrap; display: inline-block; padding: 8px 12px`. `overlay.js` applies settings as inline styles (font-family/weight/size, color, `-webkit-text-stroke: <w>px <outlineColor>`, `paint-order: stroke fill`, `opacity`), ticks every 250 ms with `OverlayClock.formatTime`, and after each update measures `#clock.getBoundingClientRect()` (ceil'd) and sends `overlay:size` only if it changed. In unlocked mode add class `unlocked` on `body`: `outline: 2px dashed rgba(255,255,255,.7)` on `#clock`, `background: rgba(0,0,0,.25)`, and `-webkit-app-region: drag`.

- [ ] **Step 2: `createOverlay`.** Use the window options and calls from Global Constraints (plus `show: false`, `webPreferences: { preload, contextIsolation: true, sandbox: true }`). On `overlay:size`: `setContentSize` then reposition with `resolvePlacement(getSettings().position, displays, size)` where `displays = screen.getAllDisplays().map(d => ({ id: d.id, workArea: d.workArea, primary: d.id === screen.getPrimaryDisplay().id }))`. Show with `showInactive()` after the first size message. On `screen` `display-added`/`display-removed`/`display-metrics-changed`, re-run placement. If the saved display is gone, the window lands on the primary display, and the saved `position.displayId` stays unchanged so it returns when that monitor is plugged back in. `setLocked(false)` → `setIgnoreMouseEvents(false)` + send `overlay:locked false`; `setLocked(true)` → compute `relativeFromBounds(win.getBounds(), displayMatching(bounds))`, call `onPositionChange(pos)`, then `setIgnoreMouseEvents(true)` + send `true`. `moveToDisplay(id)` keeps relX/relY, sets displayId, calls `onPositionChange`, re-places. `setHidden` uses `hide()` / `showInactive()`.

- [ ] **Step 3: `main.js`.** `app.requestSingleInstanceLock()` or `app.quit()`. On macOS, `app.dock.hide()`. Load settings, create the overlay, and save on position change. `app.on('window-all-closed', e => {})` must NOT quit (tray app). For this task only, register a temporary `globalShortcut` `Control+Alt+H` → toggle `setHidden`, so the user can test the early shortcut risk. Task 5 replaces it.

- [ ] **Step 4: Manual verification (Claude).** `npm start`. Expected: the clock appears top-right, on ONE line with AM/PM, and no Dock icon. Edit `settings.json` in userData to `fontSize: 200, showSeconds: false`, then restart. Expected: a bigger clock, still on one line, still 20 px from the top-right corner. Write garbage into `settings.json`, then restart. Expected: the defaults appear and nothing crashes. Run `npm start` a second time while it's running. Expected: the second process exits and only one clock shows.

- [ ] **Step 5: USER CHECKPOINT — shortcut risk check over MapleStory.** Ask the user to put MapleStory in full screen, confirm the clock is visible, and press Control+Option+H twice. Expected: the clock hides, then shows. **If the shortcut does not fire, stop and report to the user before Task 5.** The spec's fallback is to unlock and hide from the tray menu.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: auto-sizing always-on-top overlay window"`

---

### Task 5: Global shortcuts, lock/unlock drag, hide

**Files:**
- Create: `src/main/shortcuts.js`
- Modify: `src/main/main.js` (remove the temporary shortcut from Task 4)

**Interfaces:**
- Consumes: `Overlay`.
- Produces: `registerShortcuts(map: { toggleLock: string, toggleHide: string }, handlers: { toggleLock: () => void, toggleHide: () => void }) -> { ok: boolean, failed: Array<'toggleLock'|'toggleHide'> }`
  - Calls `globalShortcut.unregisterAll()`, then registers each accelerator. Wrap `register` in try/catch, because invalid strings throw. A failed key goes in `failed` and doesn't stop the other from registering.
  - Callers (main + Task 6) apply new shortcuts this way: try the new map, and if any fail, re-register the previous map and report `failed` to the settings window. A bad shortcut can never leave the user with none.

- [ ] **Step 1: Implement** `registerShortcuts`, and wire it in `main.js` from the settings. `toggleLock` → `overlay.setLocked(!overlay.isLocked())`; `toggleHide` → `overlay.setHidden(!overlay.isHidden())`. Unlocking while hidden should show the clock first. Call `globalShortcut.unregisterAll()` on `will-quit`.
- [ ] **Step 2: Manual verification (Claude, two monitors if available).** Press Ctrl+Option+C. Expected: a dashed box appears and the clock can be dragged. Drag it to the middle-left and press Ctrl+Option+C again. Expected: the box disappears, clicks pass through, and after a restart the clock reappears at the same spot. If a second display is connected, drag the clock onto it, lock it, restart, and confirm it comes back on that display. Then set `shortcutToggleLock: "Nonsense+Key"` in settings.json and restart. Expected: no crash, the other shortcut still works, and the error appears in the log.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: shortcut-driven lock/unlock dragging and hide"`

---

### Task 6: Tray menu and settings window

**Files:**
- Create: `src/main/tray.js`, `src/main/settings-window.js`, `src/preload/settings-preload.js`, `src/renderer/settings/{index.html,settings.css,settings.js,accelerator.js}`, `build/trayTemplate.png` (+ `@2x`)
- Test: `tests/accelerator.test.js`

**Interfaces:**
- Consumes: `Overlay`, `registerShortcuts`, `normalizeSettings`, `saveSettings`.
- Produces:
  - `createTray({ overlay, openSettings, quit }) -> Tray`. Menu: `Unlock to move` / `Lock` (label follows state), `Hide` / `Show`, separator, `Settings…`, separator, `Quit Overlay Clock`. Rebuild the menu when lock/hide state changes. On macOS, use a template image so it adapts to the menu bar.
  - `openSettingsWindow({ getSettings, updateSettings }) -> void`. Opens a single normal, focusable window around 420×640, or focuses it if it's already open. It is not always-on-top.
  - `updateSettings(patch: Partial<Settings>) -> { settings: Settings, shortcutErrors: string[] }` (in main.js). Merges the patch, normalizes it, applies shortcuts with rollback (Task 5), calls `app.setLoginItemSettings({ openAtLogin })`, saves, calls `overlay.applySettings`, and if `position.displayId` changed calls `overlay.moveToDisplay`.
  - Settings preload exposes `window.settingsApi = { get(): Promise<{settings, displays: Array<{id, label}>}>, update(patch): Promise<{settings, shortcutErrors}>, reset(): Promise<{settings, shortcutErrors}> }` (IPC `invoke` channels `settings:get`, `settings:update`, `settings:reset`). `reset` keeps the current `position` and restores everything else.
  - `src/renderer/settings/accelerator.js` (UMD like format-time): `eventToAccelerator(e: { key, code, ctrlKey, altKey, shiftKey, metaKey }, platform: 'darwin'|'win32') -> string|null`. Modifier order is `Control+Alt+Shift+Command` on darwin and `Control+Alt+Shift+Super` on win32. It returns null when no non-modifier key is pressed or when there are no modifiers. The key comes from `e.code`: `KeyC` → `C`, `Digit5` → `5`, `F1`–`F24` as-is, and others like `Space`/`ArrowUp` → `Space`/`Up`.

- [ ] **Step 1: Write failing tests** (`tests/accelerator.test.js`)

```js
const { eventToAccelerator } = require('../src/renderer/settings/accelerator');
const ev = (o) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });
test('ctrl+alt+C', () => expect(eventToAccelerator(ev({ key: 'c', code: 'KeyC', ctrlKey: true, altKey: true }), 'darwin')).toBe('Control+Alt+C'));
test('cmd+shift+5 on mac', () => expect(eventToAccelerator(ev({ key: '%', code: 'Digit5', metaKey: true, shiftKey: true }), 'darwin')).toBe('Shift+Command+5'));
test('win key is Super on windows', () => expect(eventToAccelerator(ev({ key: 'h', code: 'KeyH', metaKey: true }), 'win32')).toBe('Super+H'));
test('modifier alone is null', () => expect(eventToAccelerator(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), 'darwin')).toBeNull());
test('bare key without modifier is null', () => expect(eventToAccelerator(ev({ key: 'c', code: 'KeyC' }), 'win32')).toBeNull());
test('F-keys allowed with modifier', () => expect(eventToAccelerator(ev({ key: 'F9', code: 'F9', altKey: true }), 'win32')).toBe('Alt+F9'));
```

- [ ] **Step 2: Run** `npx vitest run tests/accelerator.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `eventToAccelerator`.** Then run `npx vitest run`. Expected: all pass.
- [ ] **Step 4: Build the tray and settings window.** Form controls, each sending `update` on `input` so changes apply live:
  - **Font:** a dropdown filled from `window.queryLocalFonts()` (unique `family` names), plus a "Default (System)" option. If the API fails or is denied, fall back to a free-text field. Allow it in main with `session.setPermissionRequestHandler`/`setPermissionCheckHandler` returning true for `'local-fonts'` on the settings window only.
  - **Weight:** a Normal/Bold toggle.
  - **Size:** a number input and a slider, 8–400.
  - **Text color** and **outline color:** `<input type=color>`.
  - **Outline thickness:** a slider, 0–20.
  - **Opacity:** a slider, 10–100%.
  - **Show seconds** and **24-hour time:** checkboxes.
  - **Show on:** a dropdown, shown only when more than one display is connected. Labels are "Display 1 (Main)", "Display 2", and so on, sorted by x.
  - **Unlock/lock** and **hide/show shortcuts:** click-to-record fields using `eventToAccelerator`. Show any `shortcutErrors` inline next to the field.
  - **Start at login:** a checkbox.
  - **Reset to defaults:** a button.
- [ ] **Step 5: Manual verification (Claude).** Every control visibly changes the live clock right away, which stays on one line. Settings persist across restarts. Recording a shortcut that's already in use shows an inline error and the old shortcut keeps working. The tray menu labels change with lock and hide state. Quit exits cleanly.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: tray menu and live settings window"`

---

### Task 7: Packaging, GitHub release workflow, README

**Files:**
- Create: `electron-builder.yml`, `.github/workflows/release.yml`, `README.md`, `build/icon.png`

**Interfaces:**
- `electron-builder.yml`: `appId: com.overlayclock.app`, `productName: Overlay Clock`, `files: [src/**, package.json]`, `mac: { target: [{ target: dmg, arch: universal }, { target: zip, arch: universal }], identity: "-", category: public.app-category.utilities, extendInfo: { LSUIElement: true } }`, `win: { target: [nsis, portable] }`, `nsis: { oneClick: true }`, `publish: { provider: github, releaseType: release }`.
- `release.yml`: trigger on push of tags `v*`; matrix `[macos-latest, windows-latest]`; steps checkout → setup-node (LTS) → `npm ci` → `npx vitest run` → `npx electron-builder --publish always` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`; `permissions: contents: write`.

- [ ] **Step 1: Write the config files and a simple icon.** For the icon, a clock glyph is fine.
- [ ] **Step 2: Verify the local Mac build.** Run `npx electron-builder --mac --publish never`. Expected: `dist/` contains a universal `.dmg` and `.zip`. `codesign -dv "dist/mac-universal/Overlay Clock.app"` shows `Signature=adhoc`. Opening the built app gives a clock with no Dock icon.
- [ ] **Step 3: Write the README.** Cover what the app does; default shortcuts (Ctrl+Option+C / Ctrl+Option+H on Mac, Ctrl+Alt+C / Ctrl+Alt+H on Windows); first-launch steps (macOS: open it, then System Settings → Privacy & Security → "Open Anyway"; Windows SmartScreen: "More info → Run anyway"); a note that the app never touches games; and a note that if a Windows game's exclusive fullscreen hides the clock, switch the game to borderless or windowed. Also explain how to cut a release: `npm version patch && git push --follow-tags`.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "build: packaging, release workflow, README"`
- [ ] **Step 5: USER CHECKPOINT — publish.** Ask the user before running anything. On approval: `gh repo create overlay-clock --public --source . --push`, then `npm version 0.1.0 && git push --follow-tags` (or tag `v0.1.0`). Watch the workflow with `gh run watch`. Expected: both jobs succeed and the Release has the `.dmg`, `.zip`, the Setup `.exe`, and the portable `.exe`. Give the user the Release link to send to the friend, who should test over MapleStory in full screen on Windows.
