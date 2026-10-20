# EXP Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an EXP tracker tool to Game Overlay. It reads the EXP bar and the minimap's map name from screen captures with OCR, turns readings into sessions per map using the agreed rules, and shows Live and History tabs in an active/passive overlay panel.

**Architecture:**
- **Pure, unit-tested logic:**
  - parsing and validating OCR readings (`src/shared/exp/`)
  - the session state machine and stats
  - the history store
  - image preprocessing on raw RGBA buffers, plus PNG encoding with node `zlib` (no native deps)
- **Main-process OCR service:** tesseract.js 7 (node worker) with English data bundled from `@tesseract.js-data/eng`.
- **Capture:** a hidden capture renderer uses `getDisplayMedia` (approved in main by `setDisplayMediaRequestHandler`) and sends RGBA crops to main every 4 s.
- **Shared panel shell:** the meowdb panel's window and focus behavior is extracted into `src/main/overlay-panel.js`, so both panels share it.

**Tech Stack:** Electron 44, tesseract.js 7.0.0 (pinned), @tesseract.js-data/eng 1.0.0 (pinned), Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-20-exp-tracker-design.md` (builds on `2026-10-20-game-overlay-design.md`)

## Global Constraints

- Never touch the game process. Captures stay in memory and are never written to disk or sent anywhere.
- No native npm dependencies (keeps the universal macOS build simple).
- Show nothing rather than something wrong: an unvalidated reading never changes the stats.
- **Session rules (verbatim from the spec):**
  - **Start:** the Start button or shortcut, or auto-start when there are ≥3 separate EXP increases within 20 s (only if auto-start is enabled and armed).
  - **Map change:** ends the session and never starts one. A map change needs the same new name in 2 consecutive samples.
  - **Stop:** turns auto-start off until the next map change. Start turns it back on.
  - **Pause:** 45 s without gain pauses the session, measured from the last gain. The next gain resumes it. Paused time isn't training time.
  - **End:** a pause longer than 10 min ends the session.
  - **Saving:** sessions under 60 s of training are discarded. Quitting the app saves the open session.
  - **Gains:** deaths and real jumps count as they happened (net gain). A level-up is a percentage drop of more than 50 points, and the gain carries across it.
  - **Map name:**
    - An unreadable name becomes "Unknown map", or keeps the session's known name.
    - Reading a name for an Unknown session names it; it isn't a map change.
    - A typed name applies for the rest of the session.
- **Defaults:**
  - Panel: 260×300, anchored top-right with offsetX 20, offsetY 140; shown and passive; opacity 0.85; highlight `#ff9f0a`; auto-start on.
  - Shortcuts: `Control+Alt+E` (active), `Control+Alt+R` (hide), `Control+Alt+S` (start/stop).
- **Overlay windows stay visible to capture.** If one of our windows overlaps a reading region, that region is skipped with the hint "covered by a panel".
- Version 0.3.0. Ask the user before publishing.

## Review Focus

1. **A misread sample:** a single wrong digit, `[` read as `1`, or a garbage line must never change gained EXP or the rate, and must never fake a level-up. Pinned in Task 1.
2. **A real death drop,** followed by many good reads, must not leave the validator stuck rejecting everything. Pinned in Task 1.
3. **Passing through a map:** killing 1–2 monsters must never start a session; returning to the same map after a stop doesn't auto-start until a map change. Pinned in Task 2.
4. **Small text:** at 50% scale the reader either reads correctly or reports "can't read"; it must never return a wrong number. Pinned in Task 6.
5. **Packaging:** the OCR worker, the wasm core and the trained data must load inside the packaged (asar) app on macOS. This is checked by running the packaged build in Task 9.

---

## File Structure

```
src/shared/exp/parse.js          parseExpText, parseMapName
src/shared/exp/validator.js      createValidator (requirement interval, level-ups, baseline)
src/shared/exp/session.js        createSessionMachine (rules), constants
src/shared/exp/stats.js          sessionStats, summarizeHistory
src/main/exp/history-store.js    loadHistory, saveHistory, renameSession, deleteSession
src/main/exp/image.js            crop, toGray, invert, threshold, scaleNearest, encodePng, findGameBounds
src/main/exp/ocr.js              createOcr: recognizeLine, recognizeWords (tesseract.js node worker)
src/main/exp/reader.js           createReader: locate regions, read EXP (voting), read map name
src/main/exp/capture.js          createCapture: hidden capture window, permission check, frames → callback
src/main/overlay-panel.js        createOverlayPanel (extracted from tools/meowdb.js)
src/main/tools/meowdb.js         uses overlay-panel
src/main/tools/exp.js            the tool: capture → reader → validator → session machine → panel
src/renderer/panel-shell/        shell.css, shell.js (border, tag, toolbar, resize handles; shared)
src/renderer/panel/              meowdb frame (uses panel-shell)
src/renderer/exp/                index.html, exp.css, exp.js (Live / History UI)
src/renderer/capture/            capture.html, capture.js
src/preload/exp-preload.js, capture-preload.js
tests/fixtures/exp/              status-100.png, status-75.png, status-50.png, minimap-100.png, minimap-75.png, minimap-50.png
tests/exp-*.test.js
```

---

### Task 1: Parse and validate readings

**Files:**
- Create: `src/shared/exp/parse.js`, `src/shared/exp/validator.js`
- Test: `tests/exp-parse.test.js`, `tests/exp-validator.test.js`

**Interfaces:**
- **`parseExpText(text) -> { exp: number, pct: number } | null`:**
  - `pct` is the leftmost `/(\d{1,2}[.,]\d{2})%/` match.
  - `exp` comes from the text before it: `/(\d{1,3}(?:[.,]\d{3})*)/` at the first digit, separators removed.
  - Returns null if either part is missing or `pct > 99.99`.
- **`parseMapName(lines: string[]) -> { street: string|null, map: string } | null`:**
  - Drops lines matching `/mini\s*map|world/i` and lines with fewer than 3 letters.
  - Takes the last two remaining lines as street and map, or one line as the map.
  - Trims non-letter edge characters.
- **`createValidator() -> { accept(reading: {exp, pct}) -> Verdict, reset() }`:**
  - Verdict is `{ status: 'ok'|'levelup'|'reject', exp, pct, required: [lo, hi]|null }`.
  - For each reading, the required-EXP interval is `[exp / ((pct + 0.005)/100), exp / ((pct - 0.005)/100)]` (`pct ≤ 0.005` gives `[exp, Infinity]`).
  - The running interval is the intersection of all accepted readings in the current level.
  - **reject:** the reading's interval doesn't intersect the running one.
  - **levelup:** `pct` drops by more than 50 points from the last accepted reading. The running interval resets to this reading's.
  - **Recovery:** after 3 consecutive rejects that agree with each other (overlapping intervals), the running interval resets to theirs (status `ok`).

- [ ] **Step 1: Write failing tests**

```js
test('parses the clean read', () => expect(parseExpText('27.589[68.10%]')).toEqual({ exp: 27589, pct: 68.1 }));
test('[ misread as 1 is handled', () => expect(parseExpText('27.589168.10%]')).toEqual({ exp: 27589, pct: 68.1 }));
test('commas and the EXP label', () => expect(parseExpText('EXP 1,027,589 [ 3.05%]')).toEqual({ exp: 1027589, pct: 3.05 }));
test('small numbers without separators', () => expect(parseExpText('589[1.45%]')).toEqual({ exp: 589, pct: 1.45 }));
test('garbage is null', () => { expect(parseExpText('Swordsman Harvy')).toBeNull(); expect(parseExpText('')).toBeNull(); });
test('map name from minimap lines', () => expect(parseMapName(['mini map WORLD', 'Hidden Street', 'Over the Wall'])).toEqual({ street: 'Hidden Street', map: 'Over the Wall' }));
test('no map lines gives null', () => expect(parseMapName(['mini map', ''])).toBeNull());

test('consistent readings are ok', () => {
  const v = createValidator();
  expect(v.accept({ exp: 27589, pct: 68.1 }).status).toBe('ok');
  expect(v.accept({ exp: 27650, pct: 68.25 }).status).toBe('ok');
});
test('a one-digit misread is rejected', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 }); v.accept({ exp: 27650, pct: 68.25 });
  expect(v.accept({ exp: 27583, pct: 68.1 }).status).toBe('reject');
});
test('a level-up is recognised and resets the level', () => {
  const v = createValidator();
  v.accept({ exp: 40400, pct: 99.72 });
  expect(v.accept({ exp: 120, pct: 0.27 }).status).toBe('levelup');
  expect(v.accept({ exp: 300, pct: 0.68 }).status).toBe('ok');
});
test('a real death drop is accepted (same level, consistent)', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  expect(v.accept({ exp: 23538, pct: 58.1 }).status).toBe('ok');
});
test('validator recovers after 3 agreeing rejects', () => {
  const v = createValidator();
  v.accept({ exp: 27589, pct: 68.1 });
  // pretend the first reading was wrong: three agreeing readings of a different level requirement
  expect(v.accept({ exp: 30000, pct: 60.0 }).status).toBe('reject');
  expect(v.accept({ exp: 30050, pct: 60.1 }).status).toBe('reject');
  expect(v.accept({ exp: 30100, pct: 60.2 }).status).toBe('ok');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/exp-parse.test.js tests/exp-validator.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(exp): parse and validate EXP readings`

---

### Task 2: Session state machine

**Files:**
- Create: `src/shared/exp/session.js`
- Test: `tests/exp-session.test.js`

**Interfaces:**
- **Constants (exported):** `AUTO_START_GAINS = 3`, `AUTO_START_WINDOW_MS = 20000`, `PAUSE_AFTER_MS = 45000`, `END_AFTER_PAUSE_MS = 600000`, `MIN_SAVE_MS = 60000`, `UNKNOWN_MAP = 'Unknown map'`
- **`createSessionMachine({ autoStart: boolean, onSave: (session) => void })` returns:**
  - **`sample({ t, verdict, map })`:**
    - `verdict` comes from the validator, or null when unreadable.
    - `map` is `{ street, map }` or null.
  - **`start(t)`**, **`stop(t)`**, **`nameMap(name)`**, **`tick(t)`** (handles pause and end timeouts).
  - **`quit(t)`:** saves if ≥ MIN_SAVE_MS.
  - **`setAutoStart(bool)`**
  - **`state()`:** returns `{ status: 'idle'|'tracking'|'paused', autoStartArmed, map, session: Session|null }`.
- **`Session`:**
  - `{ id, map, street, startedAt, endedAt, trainingMs, gainedExp, startLevelPct, endLevelPct, levelUps, gains: Array<{t, exp}> }`
  - `id` is `${startedAt}-${random}`. `gains` keeps the gain events from the last 10 minutes, for the 5-minute rate.
- **Training time** accrues between consecutive samples only while tracking. A pause back-dates to the last gain: the time from the last gain to the pause is removed.
- **Gain:**
  - `ok` with a higher EXP adds the difference. `ok` with a lower EXP subtracts it (death).
  - `levelup` adds `(requiredMid - prevExp) + exp`, where `requiredMid` is the midpoint of the previous level's required interval.

- [ ] **Step 1: Write failing tests** (time is in ms; a helper `ok(exp, pct)` builds a verdict):

```js
test('a couple of kills while passing through never starts a session', ...)        // 2 gains within 20 s → idle
test('steady gain auto-starts: 3 gains within 20 s', ...)                          // → tracking, map from sample
test('auto-start off: steady gain does not start', ...)
test('Start starts immediately, even without gains', ...)
test('Stop saves (≥60 s) and disarms auto-start until a map change', ...)          // keep gaining after stop → stays idle; 2× new map → armed again
test('map change needs two consecutive reads and ends the session without starting one', ...)
test('a single misread map name does not end the session', ...)
test('unreadable map name: session runs as Unknown map; first readable name just names it', ...)
test('nameMap renames the open session for the rest of it', ...)
test('45 s without gain pauses, back-dated to the last gain; next gain resumes', ...) // trainingMs excludes the 45 s
test('pause longer than 10 min ends and saves', ...)
test('sessions under 60 s of training are discarded', ...)
test('death lowers gained EXP; quest jump adds', ...)
test('level-up carries gained EXP across levels', ...)                             // 40,400 @99.72% → 120 @0.27%: gained += (~40,512-40,400)+120
test('quit saves an open session over 60 s', ...)
test('unreadable samples (null verdict) change nothing', ...)
```

Each test asserts the exact `state()` fields and the `onSave` calls (call count, plus `map` / `trainingMs` / `gainedExp`).

- [ ] **Step 2: Run** `npx vitest run tests/exp-session.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(exp): session state machine`

---

### Task 3: Stats and history store

**Files:**
- Create: `src/shared/exp/stats.js`, `src/main/exp/history-store.js`
- Test: `tests/exp-stats.test.js`, `tests/exp-history.test.js`

**Interfaces:**
- **`sessionStats(session, { now, exp, pct, required }) -> { expPerHour, last5mPerHour, pctPerHour, timeToLevelMs|null, durationMs }`:**
  - `expPerHour = gainedExp / (trainingMs/3.6e6)`, or 0 under 10 s of training.
  - `last5mPerHour` is the sum of gains in the last 5 min, scaled to an hour.
  - `timeToLevelMs = (requiredMid - exp) / last5m rate`, or the overall rate when there aren't 5 minutes yet. It's null when the rate is 0.
- **`summarizeHistory(sessions) -> Array<{ map, best: { expPerHour, levelRange, sessionId }, count }>`:** sorted by best EXP per hour, descending.
- **History store:**
  - `loadHistory(file) -> Session[]`: never throws; a corrupt file gives `[]`.
  - `saveHistory(file, sessions) -> boolean`: atomic, like `saveSettings`.
  - `renameSession(sessions, id, map) -> Session[]`, `deleteSession(sessions, id) -> Session[]`: pure.

- [ ] **Step 1: Write failing tests:**
  - EXP per hour over 30 min of training with 25,000 gained is 50,000.
  - The last-5-minutes window.
  - Time to level.
  - `summarizeHistory` picks the best session per map and sorts.
  - load/save round-trip; a corrupt file gives `[]`.
  - rename/delete are pure.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(exp): stats and history store`

---

### Task 4: EXP settings section and shortcuts

**Files:**
- Modify: `src/shared/defaults.js`, `src/main/settings-store.js`, `src/main/shortcut-fields.js`, `src/renderer/settings/settings.js` (`SHORTCUT_FIELDS` mirror), `src/main/main.js` (`KEEP_ON_RESET.exp = ['position', 'size']`)
- Test: `tests/settings-store.test.js`, `tests/shortcut-fields.test.js`

**Interfaces:**
- **`DEFAULT_EXP`:**
  ```js
  {
    startHidden: false, opacity: 0.85, highlightColor: '#ff9f0a', autoStart: true,
    shortcutToggleActive: 'Control+Alt+E', shortcutToggleHide: 'Control+Alt+R', shortcutStartStop: 'Control+Alt+S',
    size: { width: 260, height: 300 },
    position: { displayId: null, anchorX: 'right', offsetX: 20, anchorY: 'top', offsetY: 140 },
    regions: null,
  }
  ```
  `regions` holds the cached located regions: `{ displayId, exp: Rect, map: Rect|null, textHeight }`, or null.
- **`normalizeExp`:** same rules as meowdb for the shared fields. `regions` is kept only if its shape is valid. Size minimum is 220×200.
- **`SHORTCUT_FIELDS`** gains `'exp.toggleActive'`, `'exp.toggleHide'`, `'exp.startStop'`.

- [ ] **Step 1: Write failing tests:**
  - defaults
  - clamping
  - a bad `regions` value is dropped
  - `shortcutMapFromSettings` includes the 3 new ids
- [ ] **Step 2–4: Fail, then implement, then pass** (full suite: `npx vitest run`).
- [ ] **Step 5: Commit:** `feat(exp): settings section and shortcuts`

---

### Task 5: Extract the overlay panel shell from the meowdb tool

**Files:**
- Create: `src/main/overlay-panel.js`, `src/renderer/panel-shell/shell.css`, `src/renderer/panel-shell/shell.js`
- Modify: `src/main/tools/meowdb.js`, `src/renderer/panel/frame.{html,css,js}`

**Interfaces:**
- **`createOverlayPanel({ ctx, idPrefix, labels: { activate, deactivate, show, hide }, pageFile, preload, layoutContent?(bounds, { active }) })` returns:**
  - `{ win, isActive, isHidden, activate, deactivate({handBackFocus}), setHidden, place, pushState(extra), shortcutHandlers, trayItems(extraItems), applySettings(section, prev), reshow, onSecondInstance }`
- **Owns everything shared from `tools/meowdb.js`:**
  - window creation and settings
  - keep-on-top and its timer
  - placement and `clampSize`
  - activate/deactivate (including macOS `app.hide` + reshow)
  - the blur check and `checkFocus`
  - move/resize IPC (channels now prefixed: `${idPrefix}:resize`, `${idPrefix}:resize-end`)
  - saving bounds
  - display listeners and cleanup
- **`pushState(extra)`** sends `{ active, highlightColor, ...extra }` on `${idPrefix}:state`.
- **Content:** meowdb keeps its `WebContentsView`, navigation, ad blocker and error state. It passes `layoutContent` to position the view, and adds `canGoBack`/`loadError` through `pushState(extra)`.
- **Shell assets:** `shell.css` and `shell.js` hold the border, ACTIVE tag, toolbar container, status bar and resize handles, and apply the state. The meowdb frame page includes them and keeps only its own buttons and error card.

- [ ] **Step 1: Refactor.** No behavior change.
- [ ] **Step 2: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 3: Manual re-verification (CDP + `GAME_OVERLAY_DEBUG`).** Repeat Task 5's meowdb checks from the Game Overlay plan:
  - the default bounds
  - activate: view y=36, focused
  - deactivate
  - auto-passive on switching to Finder; Settings keeps it active
  - resize saves
  - the error card shows and Reload works
  - external link opens in the browser
  - hide/show

  Expected: identical results.
- [ ] **Step 4: Commit:** `refactor: shared overlay panel shell`

---

### Task 6: Image helpers, OCR service, reader

**Files:**
- Create: `src/main/exp/image.js`, `src/main/exp/ocr.js`, `src/main/exp/reader.js`
- Create fixtures `tests/fixtures/exp/*.png`, cut from the user's screenshot (2559×1440):
  - `status`: x 530–1590, y 1372–1412 (status bar line only, no chat)
  - `minimap`: x 0–300, y 0–120

  Each at 100%, 75% and 50% (box-filter downscale), produced once with a one-off script (`scripts/make-exp-fixtures.mjs`, committed) from a source path given on the command line. The source screenshot itself is not committed.
- Add dependencies: `tesseract.js@7.0.0`, `@tesseract.js-data/eng@1.0.0` (exact pins). Add the package's data directory to `asarUnpack` in `electron-builder.yml`, along with `node_modules/tesseract.js-core/**` and `node_modules/tesseract.js/**`.
- Test: `tests/exp-image.test.js`, `tests/exp-reader.test.js`

**Interfaces:**
- **`image.js`** works on `Img = { width, height, data: Uint8ClampedArray /*RGBA*/ }`:
  - `crop(img, rect)`
  - `toGray(img)` (writes gray to RGB)
  - `invert(img)`
  - `threshold(img, level)`
  - `scaleNearest(img, factor)`
  - `encodePng(img) -> Buffer` (node `zlib`)
  - `decodePng(buffer) -> Img` (tests only; 8-bit RGBA/RGB, no interlace)
  - `findGameBounds(img) -> Rect`: the bounding box of columns and rows that aren't near-black (≥ 2% of pixels with luminance > 24), so pillarbox bars are ignored.
- **`ocr.js` — `createOcr({ langPath, cachePath })`:**
  - `recognizeLine(png, { whitelist }) -> string` (PSM single line)
  - `recognizeWords(png) -> Array<{ text, bbox: {x0,y0,x1,y1} }>`
  - `terminate()`
  - Uses one tesseract worker, created lazily, with `langPath` pointing at `@tesseract.js-data/eng` (resolved with `app.asar.unpacked` when packaged).
- **`reader.js` — `createReader(ocr)`:**
  - **`locate(frame: Img) -> Regions|null`:**
    - Game bounds come from `findGameBounds`.
    - It runs `recognizeWords` on the bottom 12% of the game area and finds the word matching `/^EXP/i`.
    - `exp` rect: x from the word's right edge to that + 14 × the word height, y padded by 0.3 × the word height.
    - The minimap search runs `recognizeWords` over the top-left 20%×15% of the game area, and `map` is the box around the word lines below the "mini map" header.
    - `textHeight` is the EXP word's height.
  - **`readExp(frame, regions) -> {exp, pct}|null`:**
    - Upscale factor = `round(50 / textHeight)`, clamped to 2–8.
    - Variants: nearest/thr 110, lanczos-free nearest/thr 130, nearest/no-thr. Each is gray + invert + 20 px white padding.
    - Each variant runs `recognizeLine` with whitelist `0123456789,.[]%` then `parseExpText`.
    - Returns a value only if ≥2 variants agree exactly, otherwise null.
  - **`readMap(frame, regions) -> {street, map}|null`:** `recognizeWords` on the map rect (2× upscale), grouped into lines, then `parseMapName`.

- [ ] **Step 1: Write failing tests.**
  - `image`: crop, threshold and invert on a tiny synthetic image; `encodePng` → `decodePng` round-trip; `findGameBounds` on a synthetic image with black side bars.
  - `reader` (real OCR, 30 s timeout):
    ```js
    for (const scale of [100, 75]) test(`reads EXP at ${scale}%`, async () => expect(await readFixture('status', scale)).toEqual({ exp: 27589, pct: 68.1 }));
    test('at 50% EXP is either correct or null, never wrong', async () => { const r = await readFixture('status', 50); expect(r === null || (r.exp === 27589 && r.pct === 68.1)).toBe(true); });
    for (const scale of [100, 75]) test(`reads the map name at ${scale}%`, async () => expect((await readMapFixture(scale)).map).toBe('Over the Wall'));
    ```
    (`readFixture` puts the fixture into a black 2559-wide canvas at its original position for locate, so the game-bounds and bottom-strip logic are exercised.)
- [ ] **Step 2: Run** `npx vitest run tests/exp-image.test.js tests/exp-reader.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, tuning the thresholds only within the variants above. If 75% fails, write a ledger ruling with the measured results before changing the targets.
- [ ] **Step 4: Run.** Expected: PASS. Ledger the smallest passing scale.
- [ ] **Step 5: Commit:** `feat(exp): image helpers, OCR service and screen reader`

---

### Task 7: Screen capture service

**Files:**
- Create: `src/main/exp/capture.js`, `src/renderer/capture/{capture.html,capture.js}`, `src/preload/capture-preload.js`

**Interfaces:**
- **`createCapture({ intervalMs = 4000, onFrame(img: Img, display) })` returns `{ start(displayId|null), stop(), permission(): 'granted'|'denied'|'not-determined'|'restricted'|'unknown' }`:**
  - `permission()` uses `systemPreferences.getMediaAccessStatus('screen')` on darwin, and `'granted'` elsewhere.
  - Opens a hidden `BrowserWindow` (`show: false`, `skipTaskbar`, sandboxed, `capture-preload`).
  - `session.setDisplayMediaRequestHandler` answers only that window's requests, with the source from `desktopCapturer.getSources({ types: ['screen'] })` whose `display_id` matches.
  - The renderer calls `getDisplayMedia({ video: true })`. Every interval it draws a frame to an `OffscreenCanvas` at the native size and sends `{ width, height, data }` with `ipcRenderer.send('capture:frame', …)` (transferred `ArrayBuffer`).
  - The renderer pauses when `stop()` is called.
  - Frames go only to `onFrame` and are never stored.
- **Display choice:** the display with cached `regions.displayId`; else the display under the game (the first display where `locate` succeeds); else the primary.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Manual verification.**
  - With `GAME_OVERLAY_DEBUG`, start the capture from the main inspector, receive one frame, and log width/height plus the average luminance.
  - Expected: frame size equals the display bounds × scale factor, and the luminance isn't 0.
  - If macOS reports the permission missing, record the prompt behavior.
- [ ] **Step 3: Commit:** `feat(exp): screen capture service`

---

### Task 8: The EXP tracker tool and panel UI

**Files:**
- Create: `src/main/tools/exp.js`, `src/renderer/exp/{index.html,exp.css,exp.js}`, `src/preload/exp-preload.js`
- Modify: `src/main/main.js` (append the tool to `TOOL_MODULES`)

**Interfaces:**
- **The tool** uses `createOverlayPanel` with `idPrefix: 'exp'` and labels "Activate EXP tracker", and so on.
- **Pipeline:**
  - capture `onFrame` runs in this order:
    1. locate, if there are no regions or after 3 consecutive null reads
    2. skip regions covered by our own windows (`BrowserWindow.getAllWindows()` bounds intersect the region in screen coordinates) and set a `covered` hint
    3. `readExp` → `validator.accept`
    4. `readMap` every 3rd frame, or when the map is unknown
    5. `machine.sample`
    6. `machine.tick`
    7. `pushState`
  - Capture runs whenever the panel exists and isn't hidden, and also while a session is tracking even if the panel is hidden.
- **`pushState(extra)` payload:**
  ```js
  {
    tab, status, map, street, levelPct, stats: sessionStats(...)|null,
    hint: 'covered'|'cant-read'|'no-permission'|'locating'|null,
    needsMapName: boolean,
    history: summarizeHistory(...),
    mapSessions?: Session[] /* when a map is open in History */,
  }
  ```
- **History:**
  - the history file is `<userData>/exp-sessions.json`
  - `onSave` appends the session and saves
  - rename and delete through IPC
- **IPC (exp preload `window.expApi`):** sender-checked, accepted only while active, except `onState`:
  - `onState(cb)`
  - `startStop()`
  - `setTab('live'|'history')`
  - `openMap(name|null)`
  - `nameMap(name)`
  - `renameSession(id, map)`, `deleteSession(id)`
  - `openPermissionSettings()`: opens `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture` on darwin
  - `relocate()`
- **Shortcut handlers:**
  - `'exp.toggleActive'` and `'exp.toggleHide'` come from the shell.
  - `'exp.startStop'`: start if idle, else stop.
- **Tray:** the shell items, plus "Start EXP session" / "Stop EXP session".
- **Quit:** `app.on('before-quit')` calls `machine.quit(Date.now())` before the windows are destroyed.
- **Panel UI** (from the approved mockup, option A):
  - Tabs: Live / History.
  - **Live:**
    - map (bold), with street · Lv-less "68.10%" beneath
    - a big EXP/hour line
    - a grid with Session, Gained, To level, and Last 5 min
    - a status line, plus the hint text:
      - covered: "Minimap covered by a panel"
      - cant-read: "Can't read the EXP bar"
      - no-permission: "Allow Screen Recording" plus a button
      - locating: "Looking for the EXP bar…"
    - the "Name this map" input when `needsMapName`
    - a Start/Stop button
  - **History:** map rows (best EXP/hour · level range · N sessions). A row opens that map's sessions (time, duration, EXP/hour, gained, level range) with Rename and Delete; a back button returns.
  - Controls work only while active; passive shows Live.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 3: Manual verification (Claude).** Feed recorded fixture frames by stubbing capture `onFrame` with fixture canvases in the main inspector. Expected:
  - Live shows "Over the Wall" and 68.10%.
  - A synthetic sequence of frames (fixture re-rendered with different numbers is not possible). Instead, call `machine.sample` with readings directly through the debug hook and check that the panel's state updates (tracking, stats, pause after 45 s of simulated time via `tick`).
  - History shows the saved session.
  - Rename and delete work.
  - Covered hint: placing the meowdb panel over the minimap region sets `hint: 'covered'`.
- [ ] **Step 4: Commit:** `feat(exp): EXP tracker tool and panel`
- [ ] **Step 5: USER CHECKPOINT: real grinding over MapleStory.**
  - The panel shows the map name and EXP/hour within about 10 s of steady kills (auto-start).
  - Passing through and killing 1–2 monsters doesn't start a session.
  - Standing still for 45 s pauses it; killing again resumes.
  - Stop (⌃⌥S), then keep killing: no auto-start.
  - Changing maps ends the session.
  - The History tab lists the session (if ≥1 min).
  - **Stop and report if the numbers are wrong.**

---

### Task 9: Settings, docs, packaging, release

**Files:**
- Modify:
  - `src/renderer/settings/index.html` (EXP tracker section: opacity, highlight, auto-start, start hidden, three shortcuts, "Find EXP bar again", "Reset panel position & size")
  - `src/main/settings-window.js` (IPC `exp:relocate` → clears `regions`)
  - `README.md` (EXP tracker section; Screen Recording permission and re-granting after updates; Windows borderless tip), `.github/release-notes.md`
  - `package.json` version `0.3.0`

- [ ] **Step 1: Implement the settings section and docs.**
- [ ] **Step 2: Manual verification (CDP):** each control applies live; the duplicate shortcut is rejected inline; reset works.
- [ ] **Step 3: Packaged check.**
  - Run `npx electron-builder --mac --publish never`, then the packaged app with a frame fed from a fixture through the debug hook.
  - Expected: OCR works inside the packaged app, reading 27,589 / 68.10% from the fixture. Without it, asar paths are wrong.
- [ ] **Step 4: Commit:** `feat(exp): settings, docs and release notes for 0.3.0`
- [ ] **Step 5: USER CHECKPOINT: publish.** Ask, then tag `v0.3.0`, push, watch the run (re-run stalled jobs), and give the user the link.
