# EXP Tracker: Design

Date: 2026-10-20
Builds on: `2026-10-20-game-overlay-design.md` (Game Overlay v0.2.1: tool structure, the meowdb panel's active/passive model, settings, shortcuts, release flow). Everything there still holds.

## Intent

While grinding in MapleStory Classic (full screen, on macOS for the user, and on Windows for a friend), the user wants to see how well a spot is paying off: EXP per hour, EXP gained, and time to the next level. They also want to compare spots afterwards: "how did Over the Wall do compared with Ant Tunnel?". The game exposes none of this, so the tracker **reads it off the screen**. It captures the screen, runs text recognition on the EXP bar and the minimap's map name, and never touches the game process.

## The game's screen (from the user's screenshots, 2559×1440 capture)

- **Status bar, bottom of the game area:** `LV. 24 | Swordsman Harvy | HP[941/941] | MP[431/431] | EXP 27,589 [68.10%]`. The raw EXP number and the percentage are both shown.
- **Minimap, top-left of the game area:** header "MINI MAP", then the street name over the map name, e.g. "Hidden Street / Over the Wall". The user may have it **open, closed, or minimized** (minimized shows no map name).
- **The game may not fill the display.** One screenshot showed the game area with black bars at the sides. Don't assume the game starts at the screen's 0,0.

## Spike results (Tesseract.js 7 on the user's real screenshot)

- **Map name:** both the plain and the inverted grayscale crops read "Hidden Street\nOver the Wall" exactly.
- **EXP numbers, cropped to the text after "EXP":**
  - With 3–4× upscale + grayscale + invert + threshold 110, a `0-9,.[]/%` whitelist and single-line mode, the result was exactly `27.589[68.10%]`. The comma comes back as `.` and needs normalizing.
  - Other settings sometimes misread `9`→`3` or `[`→`1`. One read on its own is **not** reliable.
  - The same font's HP numbers had similar errors under some settings.
- **Timing:** about 20–70 ms per recognition.
- **Conclusion:** usable with **validation**:
  - Read each sample with 2–3 preprocessing variants and require agreement (voting).
  - Cross-check EXP against the percentage. Within a level, `required = exp / (pct/100)` is constant, and two-decimal percentages pin the EXP to a few points. For example, 68.10% of ~40,512 allows only about 27,587–27,591, so a misread `27,583` is rejected.
  - Discard any sample that fails a check rather than guessing.
- **Fallback if Tesseract proves too flaky in real play:** a template matcher for the game's fixed bitmap digit font. Not part of this build.

## Goals

- **A third tool, "EXP tracker"**, using the same tool interface and the same **active/passive** panel model as the meowdb panel:
  - focus hand-back
  - auto-passive on blur
  - toolbar drag to move, edge resize
  - remembered position and size
  - its own two shortcuts (active/passive, hide/show)
  - tray items and a settings section
- **One panel with two tabs, Live and History** (the user chose this from mockups; option A):
  - **Live:**
    - map name (street name as a subtitle)
    - level and current percentage
    - **EXP per hour** (big)
    - session duration (active training time, excluding pauses)
    - EXP gained this session
    - estimated time to level
    - a short-term rate (last 5 min)
    - Start/Stop button
    - a status line: Tracking, Paused, Waiting for EXP, or Can't see the EXP bar
  - **History:** maps listed by best EXP per hour, each showing the session count. Clicking a map lists its sessions, newest first, with start time, duration, EXP per hour, EXP gained and level range. Each session can be **renamed to another map** or **deleted**, to fix misread or mistyped names.
  - Tabs and buttons are clickable only while active. Passive shows the Live tab.
- **Session rules (the user's own words, settled in conversation):**
  - **Start:** only when the user presses **Start** (button or shortcut), or **automatically on steady EXP gain**: at least 3 separate EXP increases within about 20 seconds. Passing through a map and killing a couple of monsters must not start one.
  - **Map change:** ends the current session and **never starts one**.
  - **Stop:** the Stop button or shortcut, or a map change.
  - **Pause:** **45 seconds without EXP gain** pauses the session timer. The **next EXP gain resumes** it. Paused time doesn't count towards duration or EXP per hour.
  - **Save:** sessions with less than about **1 minute of active training** are thrown away, not saved to History.
  - **Level-up:** a sudden EXP drop together with a percentage drop near 0% is a level-up. The session continues, and gained EXP accounts for it (EXP to finish the old level, plus the new level's EXP).
  - **Map name unreadable** (minimap closed or minimized, or recognition fails): the session runs as **"Unknown map"** and the panel shows a "Name this map" prompt. The user types the name while the panel is active, or later in History. That name is used for the rest of the session.
- **Storage:** sessions persist locally in the user-data folder (for example `exp-sessions.json`), saved atomically. They survive restarts and updates. Live state doesn't need to survive a crash.
- **Works on macOS and Windows.** On macOS this needs the one-time **Screen Recording** permission. If it isn't granted, the panel says so with a button that opens the right System Settings pane.

## Non-goals

- Reading anything from game memory or files, injecting into the game, or automating input. This is the same anti-goal as before.
- Exporting or syncing sessions, charts, or meso/drop tracking.
- The chat market tracker (a later project).
- Reading the level badge or character name. The level can come from the level-up detection plus the percentage, or the panel can simply show "Lv" only when it's known. Showing a level is a nice-to-have.

## Anti-goals

- **Wrong numbers shown confidently.** A misread must never spike EXP per hour or log a fake level-up. When unsure, skip the sample and show "Reading…" or "Can't see the EXP bar" instead of a guess.
- **Lag or stutter in the game.** Capture and recognition must stay light. Sample every few seconds, crop small regions, and keep heavy work off the UI threads.
- **Sessions from passing through.** The auto-start rule exists to stop these.
- **Uploading screen captures anywhere.** Captures stay in memory, and nothing leaves the machine.

## Decided

- **Text recognition:** Tesseract.js, with the English trained data **bundled in the app** (no download at runtime). Use the spike's preprocessing, plus voting and the percentage cross-check above.
- **Default shortcuts:**
  - `Control+Alt+E`: activate/deactivate
  - `Control+Alt+R`: hide/show
  - `Control+Alt+S`: start/stop session

  All of these can be changed, use the same id-based registration and duplicate rejection, and go in `SHORTCUT_FIELDS`.
- **Panel defaults:** about 260×300, top-right below the clock. It starts shown and passive, with the same passive opacity and highlight rules as the meowdb panel (its own settings).
- **Settings section "EXP tracker":**
  - opacity when passive
  - highlight color
  - the three shortcuts
  - start hidden
  - auto-start on steady EXP (on by default)
  - "Find EXP bar again" (re-locate the screen regions)
  - "Reset panel position & size"

## Answers after the builder check

### The user's answers
- **Deaths and big jumps count as they really happened.**
  - Dying lowers the session's EXP gained.
  - A large real jump, such as a quest turn-in, adds to it.
  - Either is accepted only when the EXP and the percentage agree, so a misread can never cause one.
  - The misread filter must not get stuck after a real drop: once a new value is confirmed by agreeing reads, it becomes the new baseline.
- **Stop turns auto-start off until the next map change.** Start turns it back on. After a map change, auto-start is armed again on the new map, if it's enabled in settings.
- **Overlay windows stay visible to screen capture.** No content protection.
  - When one of the app's own windows overlaps a reading region (the meowdb panel over the minimap, say), skip that region and show a hint such as "Minimap covered by a panel".
  - The app knows its windows' bounds, so it doesn't need to read them.
- **macOS re-asking for Screen Recording after each update is acceptable for now.** The README explains it, and the panel's "permission missing" state links to the right System Settings pane.
- **Windows ships untested.** The friend verifies it. The README tells Windows users to switch the game to borderless or windowed mode if the capture comes back black.

### Resolution independence (the user asked how resolution is handled)
- **Never use fixed coordinates.**
  - Find the "EXP" word box in the bottom strip of the captured display, and the minimap header or name block at the top-left of the game area.
  - Crop relative to the found boxes, scaled by the found text height.
- **Upscale adaptively,** so the text cap height reaches a target of about 50 px before recognition. Don't use a fixed 3–4×.
- **Capture at the display's native pixel size** (scale factor included).
- **Test the recognition** against the user's screenshot crops at 100%, plus downscaled copies at 75% and 50%, and record the smallest scale that still passes. Below that, the panel shows "Can't read the EXP bar" instead of guessing.

### Claude's calls
- **Map changes:**
  - A map change needs the new name read the same way in 2 consecutive samples.
  - If the name becomes unreadable mid-session, the session keeps its known name.
  - When an "Unknown map" session's name becomes readable, the session is just named. That's not a map change.
- **Saving open sessions:**
  - Quitting the app saves the open session (if it has ≥1 min of training).
  - A pause longer than 10 minutes (game closed, EXP bar gone, Mac asleep) ends and saves the session.
- **Pause timing:** the 45 s of no gain before a pause aren't training time. A pause starts from the last EXP gain.
- **History:** each map's headline number is its best single session's EXP per hour, with the level range shown beside it. A session's detail also shows % of level per hour.
- **Test fixtures:** small crops of the EXP bar and minimap name only, taken from the user's screenshot. There's no chat or other players' names, so it's fine to commit them.

## Left to the builder

- **How the screen is captured:** for example `desktopCapturer` with a display stream held in a hidden renderer and grabbed every few seconds, or periodic thumbnails. Choose whatever is light enough. Check that full-screen MapleStory under Wine on macOS is actually captured (it should be, being a normal window, but verify early).
  - Prefer **no native dependencies**: crop and preprocess on a canvas in a renderer or worker rather than adding `sharp`, which would complicate the universal macOS build.
- **Which display holds the game:** auto-detect (the display where "EXP" is found), with a setting if needed.
- **Locating the regions:**
  - Search the bottom strip of the display for the "EXP" word's box, then crop the numbers to its right.
  - Search the top-left of the game area for the minimap name.
  - Cache the regions, re-locate when reads fail repeatedly, and offer "Find EXP bar again".
  - If locating fails, let the user drag a box around the EXP numbers and the map name once.
- **Sampling interval:** about 3–5 s is fine, and the auto-start and pause timings above have to work with it.
- How sessions are stored, and the exact voting and validation thresholds.
- Code structure. The session state machine and the parsing/validation are pure logic and must be unit-tested heavily, including:
  - level-up handling
  - misread rejection
  - auto-start (steady gain vs a couple of kills)
  - pause and resume at 45 s
  - discarding sessions under 1 min
  - map change ending a session
  - Unknown map naming
- **Testing the recognition:** build it against the user's screenshot (it can be committed as a test fixture with their OK). Check the full pipeline in a real session over the game at a user checkpoint, as with the earlier tools.
- **Spike scripts:** `/private/tmp/claude-501/-Users-cfraser-Projects-stuff/15d701e3-94ed-45d9-a76a-22b0e7baad46/scratchpad/ocr-spike/` (`spike.mjs`, `spike2.mjs`) show the working preprocessing parameters.
