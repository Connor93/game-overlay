# Game Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Overlay Clock to Game Overlay, restructure it into pluggable tools, and add a meowdb.com panel. The panel floats over full-screen games and switches between an obvious **active** state (has focus) and a **passive** state (click-through, keys go to the game).

**Architecture:**
- Settings become sectioned (`app`, `clock`, `meowdb`), with pure normalization and migration from the old flat file and old user-data folder.
- Each tool is a module under `src/main/tools/` exposing the same small interface: shortcuts, tray items, settings application, and re-showing after `app.hide()`. `main.js` only wires the tools together.
- The meowdb panel is a frameless always-on-top window. It holds a local frame page (border, ACTIVE tag, toolbar) plus a `WebContentsView` showing meowdb in a persistent session.
- Pure logic (settings, shortcut field mapping, navigation classification, size clamping, the blur decision) is unit-tested. Window and focus behavior is checked by hand and by the user over MapleStory.

**Tech Stack:** Electron 44, electron-builder 26, Vitest 5, plain HTML/CSS/JS.

**Spec:** `docs/superpowers/specs/2026-10-20-game-overlay-design.md` (builds on `docs/superpowers/specs/2026-10-20-overlay-clock-design.md`)

## Global Constraints

- Never inject into, hook, read memory of, or attach to a game process.
- The panel takes focus only on explicit activation (shortcut or tray item). In passive mode it ignores the mouse, can't be focused, and sends no keys anywhere.
- Activating or deactivating must not knock the game out of full screen or switch Spaces.
- **Spike-proven panel calls:**
  - Window: frameless, transparent, `setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, re-assert always-on-top every 2000 ms.
  - Activate: `setIgnoreMouseEvents(false)`, `setFocusable(true)`, `setOpacity(1)`, macOS `app.focus({ steal: true })`, `win.focus()`, `view.webContents.focus()`.
  - Deactivate: `setIgnoreMouseEvents(true)`, `setOpacity(passiveOpacity)`, `win.blur()`, `setFocusable(false)`, then on macOS `app.hide()` followed after 50 ms by re-showing *every visible overlay window* with `showInactive()` and re-asserting always-on-top.
- **Auto-passive on blur:** this skips `app.hide()`. Blurs caused by our own windows (Settings, login popups) or within 500 ms of activating are ignored.
- **Panel defaults:** 520×700; top-left anchor, offsetX 40, offsetY 80; shown and passive at start; passive opacity 0.85; highlight `#ff9f0a`; 4 px border; shortcuts `Control+Alt+M` (active/passive) and `Control+Alt+N` (hide/show). Home is `https://meowdb.com/`.
- **Rename:**
  - productName `Game Overlay`, package name `game-overlay` (so userData becomes `.../game-overlay/`), appId `com.gameoverlay.app`
  - repository `https://github.com/Connor93/game-overlay.git`, version `0.2.0`
- **Ask the user** before renaming the GitHub repo, renaming the local folder, pushing, or tagging.
- Clock behavior is unchanged.

## Review Focus

1. **Old settings:** an Overlay Clock settings file (flat shape, or only in the old `overlay-clock` user-data folder) imports with no lost fields and is never overwritten. Pinned in Task 1.
2. **Panel off-screen:** the saved panel monitor is gone, or the saved size is bigger than the current screen → the panel ends up fully on-screen and resized to fit. Pinned in Task 3 (`clampSize`) and checked by hand in Task 5.
3. **meowdb fails to load** (offline, DNS, error) → the panel shows a visible message with a working Reload, never an invisible transparent window. Pinned in Task 5.
4. **Focus while active:** opening Settings or a login popup keeps the panel active; clicking the game drops it to passive. Pinned in Task 3 (`shouldDropToPassive`) and checked by hand in Task 5.
5. **Old Overlay Clock still running** while Game Overlay starts → the clock shortcuts collide. The failure shows inline in Settings, and the README says to quit or uninstall Overlay Clock. Pinned in Task 4 (manual) and Task 7 (README).

---

## File Structure

```
src/shared/defaults.js            DEFAULT_SETTINGS (sectioned), DEFAULT_CLOCK, DEFAULT_MEOWDB, MEOWDB_HOME
src/main/settings-store.js        normalizeSettings, mergeSettingsPatch, loadSettings, saveSettings, importLegacySettings
src/main/shortcuts.js             registerShortcuts / applyShortcuts over any {id: accelerator} map
src/main/shortcut-fields.js       SHORTCUT_FIELDS, shortcutMapFromSettings, withAppliedShortcuts
src/main/placement.js             + clampSize
src/main/panel-logic.js           classifyNavigation, shouldDropToPassive, isMeowdbUrl
src/main/main.js                  wires tools, settings, tray, shortcuts
src/main/tray.js                  menu built from tool sections
src/main/settings-window.js       unchanged API + reset(section)
src/main/tools/clock.js           wraps overlay-window.js as a tool
src/main/tools/meowdb.js          the panel tool
src/main/overlay-window.js        (clock window; unchanged except reshow())
src/preload/panel-preload.js
src/renderer/panel/frame.html, frame.css, frame.js
src/renderer/settings/*           sections: General, Clock, meowdb panel
tests/settings-store.test.js, shortcuts.test.js, shortcut-fields.test.js, placement.test.js, panel-logic.test.js
```

## Tool interface (every tool module implements this)

```js
// src/main/tools/<name>.js
module.exports = {
  id: 'clock' | 'meowdb',
  create(ctx) -> Tool,
};
// ctx = {
//   getSettings(): settings[id],                 // this tool's section
//   updateSettings(patch): void,                  // patch for this tool's section only; saved (debounced)
//   refreshTray(): void,
//   reshowOverlays(): void,                       // after app.hide(): every tool's reshow()
// }
// Tool = {
//   window: BrowserWindow,                        // main overlay window (destroyed on quit)
//   shortcutHandlers: { [shortcutId]: () => void },   // ids from SHORTCUT_FIELDS, e.g. 'meowdb.toggleActive'
//   trayItems(): MenuItemConstructorOptions[],
//   applySettings(section): void,                 // live update after a settings change
//   reshow(): void,                               // showInactive + top level if it should be visible
//   onSecondInstance(): void,                     // e.g. clock unhides
// }
```

---

### Task 1: Sectioned settings with migration

**Files:**
- Modify: `src/shared/defaults.js`, `src/main/settings-store.js`
- Test: `tests/settings-store.test.js`

**Interfaces:**
- **Produces:**
  - `MEOWDB_HOME = 'https://meowdb.com/'`
  - `DEFAULT_CLOCK`: the current clock defaults without `openAtLogin`
  - `DEFAULT_MEOWDB = { startHidden: false, opacity: 0.85, highlightColor: '#ff9f0a', shortcutToggleActive: 'Control+Alt+M', shortcutToggleHide: 'Control+Alt+N', lastUrl: MEOWDB_HOME, size: { width: 520, height: 700 }, position: { displayId: null, anchorX: 'left', offsetX: 40, anchorY: 'top', offsetY: 80 } }`
  - `DEFAULT_SETTINGS = { version: 2, app: { openAtLogin: false }, clock: DEFAULT_CLOCK, meowdb: DEFAULT_MEOWDB }` (all deep-frozen)
- **`normalizeSettings(raw) -> Settings`:** if `raw` has no `clock` object but has any clock field at the top level (the old flat shape), treat `raw` itself as the clock section and take `raw.openAtLogin` into `app`.
  - Clock fields use the existing rules.
  - meowdb fields:
    - `opacity`: clamp 0.1–1
    - `highlightColor`: `#rrggbb`
    - shortcuts: non-empty strings
    - `startHidden`: boolean
    - `lastUrl`: kept only if `isMeowdbUrl`; this is defined here in settings-store as a host check (`meowdb.com` or `*.meowdb.com`, https only) and re-exported for Task 3
    - `size`: width clamp 320–4000, height clamp 300–4000
    - `position`: the same rules as the clock position
- **`mergeSettingsPatch(settings, patch: { app?, clock?, meowdb? }) -> Settings`:** merges each section shallowly, plus a nested merge for `position` and `size`, then normalizes.
- **`importLegacySettings(newPath, legacyPath) -> boolean`:**
  - if `newPath` doesn't exist and `legacyPath` does, copy legacy → new and return true
  - otherwise return false
  - never throws
  - never overwrites `newPath`
- `loadSettings` and `saveSettings` keep their current behavior.

- [ ] **Step 1: Write the failing tests** (replace the current settings-store tests; keep their intent):

```js
test('empty input gives defaults', () => expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS));
test('0.1.x flat clock settings become the clock section and app.openAtLogin', () => {
  const s = normalizeSettings({ fontSize: 90, openAtLogin: true, position: { displayId: 2, anchorX: 'left', offsetX: 5, anchorY: 'top', offsetY: 6 } });
  expect(s.clock.fontSize).toBe(90);
  expect(s.clock.position).toEqual({ displayId: 2, anchorX: 'left', offsetX: 5, anchorY: 'top', offsetY: 6 });
  expect(s.app.openAtLogin).toBe(true);
  expect(s.meowdb).toEqual(DEFAULT_MEOWDB);
});
test('0.1.0 relX/relY inside flat settings still keeps its corner', () =>
  expect(normalizeSettings({ position: { relX: 0, relY: 1 } }).clock.position).toMatchObject({ anchorX: 'left', anchorY: 'bottom' }));
test('meowdb section is validated and clamped', () => {
  const s = normalizeSettings({ clock: {}, meowdb: { opacity: 5, highlightColor: 'orange', size: { width: 10, height: 99999 }, lastUrl: 'https://evil.example/x' } });
  expect(s.meowdb.opacity).toBe(1);
  expect(s.meowdb.highlightColor).toBe('#ff9f0a');
  expect(s.meowdb.size).toEqual({ width: 320, height: 4000 });
  expect(s.meowdb.lastUrl).toBe(MEOWDB_HOME);
});
test('meowdb lastUrl on meowdb.com or a subdomain is kept', () => {
  expect(normalizeSettings({ meowdb: { lastUrl: 'https://meowdb.com/mob/123' } }).meowdb.lastUrl).toBe('https://meowdb.com/mob/123');
  expect(normalizeSettings({ meowdb: { lastUrl: 'https://www.meowdb.com/a' } }).meowdb.lastUrl).toBe('https://www.meowdb.com/a');
  expect(normalizeSettings({ meowdb: { lastUrl: 'https://meowdb.com.evil.io/' } }).meowdb.lastUrl).toBe(MEOWDB_HOME);
});
test('mergeSettingsPatch merges one section and nested position', () => {
  const s = mergeSettingsPatch(DEFAULT_SETTINGS, { meowdb: { opacity: 0.5, position: { offsetX: 99 } } });
  expect(s.meowdb.opacity).toBe(0.5);
  expect(s.meowdb.position).toEqual({ ...DEFAULT_MEOWDB.position, offsetX: 99 });
  expect(s.clock).toEqual(DEFAULT_SETTINGS.clock);
});
test('importLegacySettings copies the old file once and never overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-'));
  const legacy = path.join(dir, 'old.json'), next = path.join(dir, 'new', 'settings.json');
  fs.mkdirSync(path.dirname(next));
  fs.writeFileSync(legacy, '{"fontSize": 77}');
  expect(importLegacySettings(next, legacy)).toBe(true);
  expect(loadSettings(next).clock.fontSize).toBe(77);
  fs.writeFileSync(legacy, '{"fontSize": 11}');
  expect(importLegacySettings(next, legacy)).toBe(false);
  expect(loadSettings(next).clock.fontSize).toBe(77);
});
test('importLegacySettings with no legacy file is a no-op', () =>
  expect(importLegacySettings(path.join(os.tmpdir(), 'nope-new.json'), path.join(os.tmpdir(), 'nope-old.json'))).toBe(false));
// keep: non-object → defaults; clock invalid fields dropped/clamped (now under s.clock); corrupt/missing file → defaults;
// save round-trip; save failure returns false; clock position validation.
```

- [ ] **Step 2: Run** `npx vitest run tests/settings-store.test.js`. Expected: FAIL (new exports missing).
- [ ] **Step 3: Implement.** Split the existing clock normalization into `normalizeClock(raw)`, then add `normalizeMeowdb(raw)`, `mergeSettingsPatch` and `importLegacySettings` as specified. `importLegacySettings` creates the parent directory of `newPath` if it's missing.
- [ ] **Step 4: Run** `npx vitest run tests/settings-store.test.js`. Expected: PASS. (Other suites may fail until Task 4 rewires main; the unit suites in Tasks 1–3 never import main.)
- [ ] **Step 5: Commit:** `feat: sectioned settings with 0.1.x migration`

---

### Task 2: Generic shortcuts and shortcut field mapping

**Files:**
- Modify: `src/main/shortcuts.js`
- Create: `src/main/shortcut-fields.js`
- Test: `tests/shortcuts.test.js`, `tests/shortcut-fields.test.js`

**Interfaces:**
- `registerShortcuts(map: {[id]: accelerator}, handlers: {[id]: fn}, gs?)` and `applyShortcuts(next, prev, handlers, gs?)` keep their signatures and return shapes. They now iterate `Object.keys(map)` instead of a fixed list, and a key with no handler is skipped.
- **`SHORTCUT_FIELDS`:**
  ```js
  {
    'clock.toggleLock': ['clock', 'shortcutToggleLock'],
    'clock.toggleHide': ['clock', 'shortcutToggleHide'],
    'meowdb.toggleActive': ['meowdb', 'shortcutToggleActive'],
    'meowdb.toggleHide': ['meowdb', 'shortcutToggleHide'],
  }
  ```
- **`shortcutMapFromSettings(settings) -> {[id]: accelerator}`**
- **`withAppliedShortcuts(settings, applied) -> Settings`:** writes the applied accelerators back into their sections and returns a new object.
- **Errors:** shortcut errors reported to the settings window are now the shortcut ids (for example `'meowdb.toggleActive'`), not field names.

- [ ] **Step 1: Write failing tests.** Update the existing shortcut tests to use ids like `'clock.toggleLock'` and add `test('registers every id in the map, including new tools', ...)`, which registers four ids and asserts all four are registered. New `shortcut-fields.test.js`:

```js
test('maps settings sections to shortcut ids', () =>
  expect(shortcutMapFromSettings(DEFAULT_SETTINGS)).toEqual({
    'clock.toggleLock': 'Control+Alt+C', 'clock.toggleHide': 'Control+Alt+H',
    'meowdb.toggleActive': 'Control+Alt+M', 'meowdb.toggleHide': 'Control+Alt+N',
  }));
test('withAppliedShortcuts writes accelerators back without mutating', () => {
  const s = withAppliedShortcuts(DEFAULT_SETTINGS, { 'meowdb.toggleActive': 'Control+Alt+K' });
  expect(s.meowdb.shortcutToggleActive).toBe('Control+Alt+K');
  expect(DEFAULT_SETTINGS.meowdb.shortcutToggleActive).toBe('Control+Alt+M');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/shortcuts.test.js tests/shortcut-fields.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: shortcuts keyed by tool id`

---

### Task 3: Pure panel logic

**Files:**
- Create: `src/main/panel-logic.js`
- Modify: `src/main/placement.js`
- Test: `tests/panel-logic.test.js`, `tests/placement.test.js`

**Interfaces:**
- **`isMeowdbUrl(url) -> boolean`:** re-exported from settings-store (Task 1).
- **`OAUTH_HOSTS`:** `['accounts.google.com', 'discord.com', 'www.discord.com', 'appleid.apple.com', 'www.facebook.com', 'id.twitch.tv', 'twitter.com', 'x.com', 'api.twitter.com']`
- **`classifyNavigation(url, disposition) -> 'panel' | 'popup' | 'external'`:**
  - meowdb URL → `'panel'`
  - non-http(s) → `'external'`
  - an OAuth host → `'popup'` when `disposition === 'new-window'`, otherwise `'panel'`, so full-page OAuth redirects stay in the panel
  - any other host → `'external'`
- **`shouldDropToPassive({ active, ownWindowFocused, msSinceActivate }) -> boolean`:** returns `active && !ownWindowFocused && msSinceActivate >= 500`.
- **`clampSize(size, workArea, min = { width: 320, height: 300 }) -> {width, height}`:** each dimension is clamped to `[min, workArea dimension]`. If the work area is smaller than the minimum, the work-area dimension wins.

- [ ] **Step 1: Write failing tests**

```js
test('meowdb links stay in the panel', () => expect(classifyNavigation('https://meowdb.com/item/1', 'default')).toBe('panel'));
test('other sites open externally', () => expect(classifyNavigation('https://reddit.com/r/Maplestory', 'foreground-tab')).toBe('external'));
test('lookalike hosts open externally', () => expect(classifyNavigation('https://meowdb.com.evil.io/', 'default')).toBe('external'));
test('non-web schemes open externally', () => expect(classifyNavigation('mailto:a@b.c', 'default')).toBe('external'));
test('OAuth popup opens as an in-app popup', () => expect(classifyNavigation('https://discord.com/oauth2/authorize?x', 'new-window')).toBe('popup'));
test('full-page OAuth redirect stays in the panel', () => expect(classifyNavigation('https://accounts.google.com/o/oauth2/auth', 'default')).toBe('panel'));

test('clicking the game while active drops to passive', () =>
  expect(shouldDropToPassive({ active: true, ownWindowFocused: false, msSinceActivate: 5000 })).toBe(true));
test('opening our own Settings or a login popup keeps it active', () =>
  expect(shouldDropToPassive({ active: true, ownWindowFocused: true, msSinceActivate: 5000 })).toBe(false));
test('blur during activation is ignored', () =>
  expect(shouldDropToPassive({ active: true, ownWindowFocused: false, msSinceActivate: 100 })).toBe(false));
test('already passive stays passive', () =>
  expect(shouldDropToPassive({ active: false, ownWindowFocused: false, msSinceActivate: 5000 })).toBe(false));

// placement.test.js
test('clampSize shrinks a saved size to fit a smaller screen', () =>
  expect(clampSize({ width: 2000, height: 1500 }, { x: 0, y: 0, width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 }));
test('clampSize enforces the minimum', () =>
  expect(clampSize({ width: 100, height: 100 }, { x: 0, y: 0, width: 1920, height: 1080 })).toEqual({ width: 320, height: 300 }));
```

- [ ] **Step 2: Run** `npx vitest run tests/panel-logic.test.js tests/placement.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/panel-logic.test.js tests/placement.test.js tests/settings-store.test.js tests/shortcuts.test.js tests/shortcut-fields.test.js`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: panel navigation, focus and sizing logic`

---

### Task 4: Tools restructure, clock as a tool, rename

**Files:**
- Create: `src/main/tools/clock.js`
- Modify:
  - `src/main/main.js`, `src/main/tray.js`, `src/main/overlay-window.js` (add `reshow()`), `src/main/settings-window.js`
  - `src/renderer/settings/{index.html,settings.js}`
  - `package.json`, `electron-builder.yml`

**Interfaces:**
- **Consumes:** everything from Tasks 1–3 and the Tool interface above.
- **`main.js`:**
  - Before `loadSettings`, call `importLegacySettings(settingsPath, path.join(app.getPath('appData'), 'overlay-clock', 'settings.json'))`.
  - Build `tools = [clockTool]`. Task 5 appends meowdb.
  - `updateSettings(patch)` uses `mergeSettingsPatch`, applies shortcuts with rollback over `shortcutMapFromSettings` and writes the result back with `withAppliedShortcuts`. It calls each changed section's `tool.applySettings`, and `setLoginItemSettings` when `app.openAtLogin` changes. It returns `{ settings, shortcutErrors: string[] /* ids */ }`.
  - `resetSettings(section: 'clock' | 'meowdb')` restores that section's defaults, keeping its `position` (and for meowdb also `size` and `lastUrl`).
  - `reshowOverlays()` calls `tool.reshow()` on every tool.
- **`createTray({ getSections: () => MenuItemConstructorOptions[][], openSettings, quit })`:** it builds sections joined by separators, then `Settings…` and `Quit Game Overlay`. Tooltip: "Game Overlay".
- **Settings window:**
  - `settings:get` returns `{ settings, shortcutErrors, displays }` (sectioned).
  - `settings:update` takes a sectioned patch.
  - `settings:reset` takes the section name.
  - The renderer shows a **General** section (start at login) and a **Clock** section (all current clock controls, plus "Reset clock to defaults"). Shortcut buttons carry `data-shortcut-id` (for example `clock.toggleLock`), and errors are matched by id.
- **Rename:**
  - `package.json`: name `game-overlay`, productName `Game Overlay`, description, repository URL `game-overlay`, version `0.2.0`
  - `electron-builder.yml`: `appId: com.gameoverlay.app`, `productName: Game Overlay`
  - settings window title: "Game Overlay Settings"

- [ ] **Step 1: Implement** as specified. `tools/clock.js` is a thin adapter over `createOverlay`, moving the clock shortcut handlers and tray items out of `main.js` and `tray.js` into the tool.
- [ ] **Step 2: Run** `npx vitest run`. Expected: all suites pass.
- [ ] **Step 3: Manual verification.**
  - **Old settings import:** with an Overlay Clock-format file at `~/Library/Application Support/overlay-clock/settings.json` and none at `.../game-overlay/`, run `npm start`. Expected: the clock appears with those settings, and `.../game-overlay/settings.json` now exists in the sectioned shape.
  - **Settings window (driven through CDP):** changing clock size, format and outline updates the clock live. Reset clock restores the defaults and keeps the position. A bad shortcut shows an inline error under the right field.
  - **Clashing with old Overlay Clock:** with the installed Overlay Clock running, start Game Overlay. Expected: no crash. Any clock shortcut that fails to register shows inline in Settings (macOS may report success; record what happens).
  - **Second launch:** the clock unhides and Settings opens.
  - **Quit:** exits cleanly.
- [ ] **Step 4: Commit:** `refactor: tools structure, clock as a tool, rename to Game Overlay`

---

### Task 5: The meowdb panel tool

**Files:**
- Create:
  - `src/main/tools/meowdb.js`
  - `src/preload/panel-preload.js`
  - `src/renderer/panel/{frame.html,frame.css,frame.js}`
- Modify: `src/main/main.js` (append the tool)

**Interfaces:**
- **Window:**
  - frameless, transparent, `hasShadow: false`
  - `closable/minimizable/maximizable: false`, `skipTaskbar: true`
  - `focusable: false`, `resizable: false`, `minWidth: 320`, `minHeight: 300`
  - `system-context-menu` is prevented
  - top level, all-workspaces and re-assert as in Global Constraints
  - size from `clampSize(settings.size, display.workArea)`, position from `resolvePlacement`
- **Frame page:**
  - draws the 4 px border (`highlightColor` when active, transparent when passive), an ACTIVE tag at the top right, and a 32 px toolbar visible only while active
  - toolbar buttons: Back, Forward, Home, Reload (`-webkit-app-region: no-drag`); the toolbar background is the drag region
  - shows an error card ("Couldn't load meowdb" + Reload) when the view reports a load failure
- **View:**
  - a `WebContentsView` with `webPreferences: { partition: 'persist:meowdb', sandbox: true, contextIsolation: true }`
  - bounds `{ x: 4, y: 4 + (active ? 32 : 0), width: w - 8, height: h - 8 - (active ? 32 : 0) }`
  - re-laid out on resize and on state change
- **Preload (`window.panelApi`):**
  - `onState(cb)` receives `{ active, highlightColor, canGoBack, canGoForward, loadError: string|null }`
  - `nav(action: 'back'|'forward'|'home'|'reload')`
  - IPC channels `panel:state` (main→frame) and `panel:nav` (frame→main, sender-checked)
- **Navigation:**
  - `view.webContents.setWindowOpenHandler(({url, disposition}))` and `will-navigate`, both via `classifyNavigation`:
    - `'panel'` → load in view
    - `'external'` → `shell.openExternal(url)` and deny
    - `'popup'` → allow, with `overrideBrowserWindowOptions` `{ alwaysOnTop: true, parent: win, webPreferences: { partition: 'persist:meowdb' } }`; then in `did-create-window` set `'screen-saver'` level and `visibleOnFullScreen`
  - on `did-navigate` / `did-navigate-in-page`: if `isMeowdbUrl(url)`, `ctx.updateSettings({ lastUrl: url })`, then push state
  - on `did-fail-load` (main frame, `errorCode !== -3`): set `loadError` and push state; clear it on the next successful `did-finish-load`
  - when the error card is showing, the view's height is set to 0 so the card is visible
- **State:**
  - `setActive(true)`: spike activate calls, plus `win.setResizable(true)` and record `activatedAt`
  - `setActive(false, { handBackFocus: true })`: spike deactivate calls, plus `setResizable(false)`, then on macOS `app.hide()` and 50 ms later `ctx.reshowOverlays()`
  - `handBackFocus: false` (the auto-passive path) skips blur, `app.hide` and reshow
  - After any change: push state, `ctx.refreshTray()`, and when deactivating, save position and size (`positionFromBounds(win.getBounds(), display)` + `{width, height}`)
- **Auto-passive:**
  - `app.on('browser-window-blur')` → `setTimeout(100)` → `shouldDropToPassive({ active, ownWindowFocused: BrowserWindow.getFocusedWindow() !== null, msSinceActivate: Date.now() - activatedAt })`, and if true `setActive(false, { handBackFocus: false })`
  - also save bounds on `moved` / `resized` while active
- **Hide/show:** `setHidden(true)` deactivates without handing back focus, then `win.hide()`. `setHidden(false)` → `showInactive()`. `startHidden` is applied at launch.
- **Shortcut handlers:**
  - `'meowdb.toggleActive'`: if hidden, show then activate; otherwise toggle
  - `'meowdb.toggleHide'`: toggle hidden
- **Tray items:**
  - `Activate meowdb` / `Deactivate meowdb`
  - `Hide meowdb` / `Show meowdb`
  - `Go to meowdb home`
- **`applySettings(section)`:** pushes `highlightColor`, updates opacity if passive, and re-places if the position or size changed (the reset case).
- **`reshow()`:** `showInactive()` plus always-on-top if not hidden.
- **On the Windows side, deactivate** uses the same calls without `app.hide`. If `win.blur()` doesn't hand focus back to the game on Windows, the friend will report it; Task 7's README notes clicking the game as a fallback.

- [ ] **Step 1: Implement** as specified.
- [ ] **Step 2: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 3: Manual verification (Claude, via CDP + CGWindowList):**
  - **Startup:** the panel appears at the default bounds at layer 1000, passive, at about 85% opacity.
  - **Activate (via tray handler through main inspector):** the frame state is `active: true`, the toolbar is visible, and the view's y is 36.
  - **Navigation:** navigating to `https://meowdb.com/` then a sub-page updates `lastUrl` in settings.json. Navigating to an external URL calls openExternal; stub `shell.openExternal` in the inspector to record calls.
  - **Load failure:** loading `https://meowdb.invalid/` through the view gives a visible error card.
  - **Off-screen settings:** a settings.json with panel size 5000×5000 and displayId 99 opens on the primary display, fully on-screen, and clamped.
- [ ] **Step 4: Commit:** `feat: meowdb panel tool`
- [ ] **Step 5: USER CHECKPOINT over MapleStory in full screen.**
  - ⌃⌥M activates: orange border plus toolbar, and typing a search works.
  - ⌃⌥M deactivates: keys go to the game immediately and the clock stays visible.
  - With the panel active, clicking the game drops it to passive on its own.
  - Opening Settings from the tray while the panel is active keeps it active.
  - Dragging the toolbar moves the panel and dragging an edge resizes it. Both survive a restart, along with the last page.
  - ⌃⌥N hides and shows the panel.
  - The game never leaves full screen.
  - **Stop and report if any item fails.**

---

### Task 6: meowdb settings section

**Files:**
- Modify: `src/renderer/settings/{index.html,settings.js,settings.css}`

**Interfaces:**
- The **meowdb panel** section sits between Clock and General and contains:
  - Passive see-through: slider 10–100% bound to `meowdb.opacity`
  - Highlight color: `meowdb.highlightColor`
  - Activate/deactivate shortcut (`data-shortcut-id="meowdb.toggleActive"`)
  - Hide/show shortcut (`meowdb.toggleHide`)
  - Start hidden: checkbox
  - "Reset panel position & size": sends `settings:update` with `{ meowdb: { position: DEFAULT_MEOWDB.position, size: DEFAULT_MEOWDB.size } }`. The defaults come from `settings:get`, which now also returns `defaults` (`DEFAULT_SETTINGS`).
- All controls apply live through the existing `update(patch)`, now sectioned: `update({ meowdb: { opacity } })`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Manual verification (CDP):**
  - each control changes the panel live: opacity while passive, border color while active
  - a duplicate shortcut (setting meowdb's active toggle to `Control+Alt+C`, already used by the clock) is rejected with an inline error under the meowdb field, and the previous shortcut keeps working
  - Reset puts the panel back at the defaults
- [ ] **Step 3: Commit:** `feat: meowdb panel settings`

---

### Task 7: README, release notes, publish

**Files:**
- Modify: `README.md`, `.github/workflows/release.yml` (release body)

- [ ] **Step 1: Rewrite the README for Game Overlay.**
  - **What it does:** the clock plus the meowdb panel.
  - **Shortcut table:** all four shortcuts, for macOS and Windows.
  - **Active vs passive:** what each means, and that clicking the game also drops the panel to passive.
  - **Upgrading from Overlay Clock:** settings import automatically; quit and uninstall Overlay Clock, because both apps use the same clock shortcuts.
  - **macOS first launch:** keep the existing steps and add the `xattr -dr com.apple.quarantine "/Applications/Game Overlay.app"` alternative.
  - **Windows note:** if keys don't return to the game after deactivating, click the game once, and report it.
  - **Asset names:** `Game-Overlay-…`.
- [ ] **Step 2: Release notes.** In `release.yml`, the draft step creates the release with `--notes-file .github/release-notes.md` instead of `--generate-notes`. Create `.github/release-notes.md` with the upgrade steps: uninstall Overlay Clock, settings carry over, and the new shortcuts.
- [ ] **Step 3: Build check.** Run `npx vitest run && npx electron-builder --mac --publish never`. Expected: tests pass, and `dist/` has `Game Overlay` universal dmg/zip with `Signature=adhoc`.
- [ ] **Step 4: Commit:** `docs: Game Overlay README and release notes`
- [ ] **Step 5: USER CHECKPOINT: publish.** Ask before running any of these:
  - `gh repo rename game-overlay`
  - `git remote set-url origin https://github.com/Connor93/game-overlay.git`
  - rename the local folder `overlay-clock` → `game-overlay`
  - `npm version` is already 0.2.0 from Task 4, so tag `v0.2.0` and `git push --follow-tags`
  - watch the run (re-run failed jobs if a macOS runner stalls, as happened for 0.1.1)
  - give the user the release link and the steps for the friend
