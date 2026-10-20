# Game Overlay (Overlay Clock + meowdb panel): Design

Date: 2026-10-20
Builds on: `2026-10-20-overlay-clock-design.md` (shipped as Overlay Clock v0.1.1). Everything in that design still holds unless this document changes it.

## Intent

Turn Overlay Clock into a single overlay app that holds several tools for playing MapleStory in full screen. The first new tool is a **meowdb panel**: a floating window showing https://meowdb.com over the game. While farming, the user wants to look up what a mob drops, where to get an item, or where to level, without leaving the game. They then keep that info on screen while they go back to playing.

meowdb has no public API, so the panel is an embedded browser view of the real site. Nothing is scraped or re-hosted.

The user plays on macOS (MapleStory through Steam, Wine-based, full screen). A friend tests on Windows.

## Roadmap (separate future projects; not built here)

1. **This project:** rename to Game Overlay, add the tool structure, and add the meowdb panel.
2. **Next:** EXP tracker. It captures the screen area around the EXP bar every few seconds, reads it with OCR, and shows EXP per minute and per hour. This needs screen-capture permission on macOS.
3. **Later, low priority:** chat market tracker. It reads the chat area and builds buy/sell price lists.

This project must make it easy to add tools 2 and 3 as new tools, each with its own window, shortcuts, settings section, and tray section, without restructuring the app.

## Goals

- **Rename:** Overlay Clock becomes **Game Overlay** (Claude's call; the user agreed to a rename and can change the name). The clock keeps working exactly as now.
- **meowdb panel:**
  - A floating window over everything, including full-screen games, on macOS and Windows, showing meowdb.com.
  - Two clearly distinct states, switched by a global shortcut:
    - **Active:** the panel has keyboard and mouse focus. It shows a bright highlight border plus an "ACTIVE" tag, and the user can search, click and scroll.
    - **Passive:** the panel stays visible, slightly see-through, with no highlight. All clicks pass through it, keyboard focus goes back to the game, and the user can move their character immediately without clicking the game first.
  - A second global shortcut hides or shows the panel. Hiding always leaves it passive.
  - **Toolbar:** a thin bar with Back, Forward, Home (meowdb.com) and Reload. It is visible only while active. Dragging the bar moves the panel, and dragging the panel's edges resizes it, both only while active.
  - **Remembers:** size, position (including which monitor), last page URL, and cookies/login (a persistent session), across restarts.
  - **Links outside meowdb.com** open in the system default browser, not in the panel.
- **Settings:** a section per tool. The meowdb section covers:
  - passive opacity
  - active highlight color
  - both shortcuts
  - start hidden/shown
  - "Reset panel position/size"
- **Tray/menu-bar menu:** a section per tool. The meowdb section has Activate/Deactivate, Hide/Show and Go to meowdb home. The existing clock items stay.

## Non-goals

- Any API integration with meowdb, scraping, or caching its data.
- Ad blocking, custom styling, or injecting scripts into meowdb.
- A general-purpose browser with tabs, an address bar, or other sites.
- The EXP tracker and the chat tracker (separate projects).

## Anti-goals

- **Touching the game:** no injecting into, hooking, reading memory of, or attaching to any game process. Unchanged from the clock design.
- **Unclear focus:** the panel must never take keyboard focus when the user didn't ask for it, and passive must never leave keys going nowhere. If the user can't tell where their keys go, the panel has failed.
- **Kicking the game out of full screen:** activating or deactivating the panel must not push MapleStory out of full screen or switch Spaces on macOS.
- **Losing user state:** the rename must not lose the user's or the friend's existing clock settings.

## Decided

### Proven by spike (macOS, over full-screen MapleStory; the user confirmed every step works)
A throwaway Electron build with these settings worked:
- The panel is a frameless, transparent `BrowserWindow` with the same always-on-top settings as the clock:
  - `setAlwaysOnTop(true, 'screen-saver')`
  - `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
  - re-asserting always-on-top every 2 s
  - `app.dock.hide()`
- It loads a local frame page that draws the 4 px border and the "ACTIVE" tag. meowdb loads in a `WebContentsView` child, inset by the border width.
- **Activate:**
  - `setIgnoreMouseEvents(false)`, `setFocusable(true)`, `setOpacity(1)`
  - on macOS `app.focus({ steal: true })`
  - then `win.focus()` and `view.webContents.focus()`
- **Deactivate:**
  - `setIgnoreMouseEvents(true)`, `setOpacity(0.85)`, `win.blur()`, `setFocusable(false)`
  - on macOS `app.hide()`, then after about 50 ms `win.showInactive()` and re-assert always-on-top. This hands activation back to the game.
  - The user confirmed that keys went straight back to MapleStory and that full screen was never disturbed.
- Shortcuts `Control+Alt+M` (active/passive) and `Control+Alt+N` (hide/show) worked while the game had focus.

**Watch out:** `app.hide()` hides *every* app window, including the clock. After `app.hide()`, re-show every overlay window that should be visible (the clock and the panel) with `showInactive()`. Don't re-show the settings window; it's fine for that one to hide when the panel deactivates.

**Not yet verified on Windows.** On Windows the deactivate path may need something other than `blur()` to give focus back to the game; the builder decides. The friend tests it on the first release, and the README gets a note.

### Losing focus while active (the user chose this)
If the active panel loses focus by any route other than the shortcut, it **drops to passive automatically**: the user clicks the game, Cmd/Alt+Tabs away, or a link opens in the system browser. The border, tag and toolbar go away, clicks pass through, and opacity drops. Orange therefore always means keys are going to the panel. Because focus has already moved, this path must not call `app.hide()` or try to hand focus back.

Blurs the app causes itself must not drop the panel to passive. These are:
- opening the Settings window,
- an in-panel login popup,
- the moment during activation itself (`app.focus({ steal: true })`).

### Small calls (Claude's, after the builder check)
- Pressing the active/passive shortcut while the panel is hidden shows it and makes it active.
- App-wide settings that belong to no single tool (`openAtLogin`) live in their own top-level section of the settings file, not under a tool.

### Defaults
- **Panel:** about 520×700, top-left of the primary display's work area, 40 px from the left and 80 px from the top. It starts shown and passive.
- **Passive opacity:** 0.85. **Highlight:** `#ff9f0a` (orange). **Border:** 4 px.
- **Shortcuts:** `Control+Alt+M` for active/passive and `Control+Alt+N` for hide/show. Like the clock's, they can be changed and use the same rollback-on-failure behavior.

### Positioning
Reuse the clock's corner-anchored placement: `positionFromBounds` and `resolvePlacement`, which store an anchor corner plus pixel offsets and fall back to the primary display. Size is stored too, and clamped so the panel always fits within the work area of the display it's on.

### Rename and migration
- Change the product name to "Game Overlay", the app id to `com.gameoverlay.app`, and the package/repo name to `game-overlay`. The local folder and GitHub repo are renamed with the user's OK when publishing: GitHub redirects the old repo URL, and the old release links keep working.
- **Settings migration:** on first launch, if there's no settings file under the new user-data directory but an Overlay Clock one exists (macOS `~/Library/Application Support/overlay-clock/settings.json`; Windows `%APPDATA%\overlay-clock\settings.json`), import the clock settings from it.
- The friend will have both apps installed after updating. The README and release notes tell them to uninstall Overlay Clock.
- **Settings file shape:** clock settings move under `clock`, and new `meowdb` settings sit alongside. The old flat shape is still read, as part of the migration.

## Left to the builder

- How tools are structured in code (a tool module interface for windows, shortcuts, settings section and tray items), as long as adding the EXP tracker later means adding a module, not reworking the app.
- How the toolbar looks (plain icon buttons are fine). It must be visible and usable only when active.
- How edge-resize works on a frameless window: native `resizable: true` while active, or custom handles.
- The Windows deactivate mechanism.
- How the last URL and cookies persist. A `persist:meowdb` session partition plus saving the URL on navigation is the obvious route.
- How "leaves meowdb.com" is judged: the host is `meowdb.com` or a subdomain of it. If meowdb relies on a third-party login popup (Google/Discord OAuth), let that open in the panel, not in the system browser, so login still works.
- How the settings window is organized into tool sections.
- Test coverage: pure logic (settings migration and normalization, URL allow-listing, size clamping) gets unit tests. Window and focus behavior is checked by hand.
