# Overlay Clock — Design

Date: 2026-10-20

## Intent

A small standalone desktop app that shows the current local time as floating text above everything else on screen, including games in full screen. The motivating case is playing MapleStory in full screen: the OS clock is hidden, and the user wants to keep track of real time without leaving the game.

The user plays on macOS: MapleStory installed through Steam, running in a Wine-based compatibility layer. Other people who may use the app are on Windows and may have more than one monitor.

Success means the clock is always visible over the game, never gets in the way of playing, and can be restyled and moved to suit each person.

## Goals

- Show local time as text on a fully transparent background, with no window chrome, shadow, or box.
- Stay above every other window, including full-screen apps and games, on macOS and Windows.
- Let clicks pass through to whatever is underneath during normal use.
- Let the user restyle the clock and move it, including onto another monitor.
- Remember all settings and the position between launches.
- Ship as a standalone downloadable app for macOS and Windows.

## Non-goals

- Game server time, UTC, reset countdowns, alarms, timers. Local time only.
- Linux.
- Paid code signing or notarization for now. Users will see a one-time "unidentified developer" / SmartScreen warning, which is acceptable.
- App store distribution.

## Anti-goals (failure even if it "works")

- **Touching the game in any way.** No injecting into, hooking, reading memory from, or attaching to another process. That is how overlays such as Discord's work, and it risks anti-cheat flags or account bans. This is an ordinary top-most window and nothing more.
- Catching clicks or keyboard focus meant for the game during normal use. The clock must never steal focus.
- Disappearing off-screen, for example when the monitor it was on is disconnected.

## Decided

### Platform and toolkit
- Electron, with one codebase for macOS and Windows. This was Claude's call and the user accepted it. The known cost is an app of roughly 100 MB.

### Proven by spike (macOS, over MapleStory in full screen, confirmed working by the user)
A throwaway Electron build with these settings showed correctly over the game:
- `app.dock.hide()` on macOS, so it runs as an accessory app with no Dock icon. This is needed for it to join full-screen spaces.
- A `BrowserWindow` with `transparent: true`, `frame: false`, `hasShadow: false`, `resizable: false`, `skipTaskbar: true`, `focusable: false`, `alwaysOnTop: true`.
- `win.setAlwaysOnTop(true, 'screen-saver')`
- `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
- `win.setIgnoreMouseEvents(true)`
- Re-asserting `setAlwaysOnTop(true, 'screen-saver')` every 2 s, in case something else takes the top spot.

The one bug in the spike: the window had a fixed 320×110 size, so "PM" wrapped onto a second line and was cut off. **The time must always render on a single line, and the window must size itself to fit the rendered text for any font, size, or format.**

Windows has not been tested yet. A friend of the user will test it over MapleStory in full screen on Windows. A game in true exclusive fullscreen may not allow any normal top-most window to show over it. If that happens, the answer is to play in windowed or borderless mode, never to inject into the game (see anti-goals). Document this in the README.

### Default look (the user approved the spike's look)
- White, bold system font (`-apple-system` / `Segoe UI`), about 64 px.
- Black outline about 3 px, drawn behind the fill (`-webkit-text-stroke` with `paint-order: stroke fill`).
- Format `hh:mm:ss AM/PM` (seconds shown, 12-hour), on one line.
- Top-right corner of the primary display's work area, about 20 px in from the right and top edges.

### Moving it
- In normal ("locked") mode, clicks pass through.
- A global shortcut toggles "unlock" mode. In unlock mode the clock accepts the mouse, shows a faint visible box around itself, and can be dragged anywhere, including onto another monitor. Pressing the shortcut again locks it, and clicks pass through again.
- A second global shortcut hides or shows the clock.
- The user said: "Once we have it done, if it feels bad, we can change it." Keep this interaction easy to rework.

### Multiple monitors
- Dragging across monitors works in unlock mode.
- When more than one display is connected, settings shows a "Show on" list. Picking a display moves the clock to the same relative corner or position on that display.
- The app remembers which display the clock was on and its position. *(Claude's call)* If that display isn't connected at launch, or is unplugged while running, the clock moves to the primary display, in the default position or the closest equivalent, so it can never end up off-screen.

### Settings window
Opened from a menu-bar icon on macOS or a tray icon on Windows. That icon's menu also offers Unlock/Lock, Hide/Show, Settings, and Quit.

Settings the user asked for:
- Text size
- Font
- Text color
- Outline color
- Outline thickness (including 0 for no outline)

*Claude's additions, proposed to the user and not objected to:*
- Show seconds on/off
- 12/24-hour
- Overall opacity
- Changeable shortcuts for unlock/lock and hide/show
- Start at login
- Show on (display picker, see above)
- Reset to defaults

Changes apply to the live clock immediately as they are made.

### Distribution
- Packaged downloadable builds: a macOS `.dmg` or `.zip` and a Windows installer or portable `.exe`. No paid certificates.
- The app should be easy to hand to a friend on Windows for testing.
- The user chose to have **GitHub build it**. The project goes on the user's GitHub. A GitHub Actions workflow builds the Windows version on a Windows runner and the macOS version on a macOS runner, and attaches both to a GitHub Release. The friend downloads from the Release link. The only Mac machine available is the user's. There is no Windows machine.
- *(Claude's call)* The repository is public, so the friend can download Releases without a GitHub account or an invite. It contains nothing sensitive. Confirm with the user before creating or pushing the repo.
- *(Claude's call)* The macOS build gets a free ad-hoc signature. Without one, a downloaded unsigned Apple Silicon app is reported as "damaged." Build for both Apple Silicon and Intel (universal, or two builds). The README gives accurate first-launch steps: recent macOS requires allowing the app in System Settings > Privacy & Security, because the right-click > Open bypass is gone. It also covers Windows SmartScreen ("More info > Run anyway").

### Early risk to verify first
The spike did not test whether global shortcuts fire while MapleStory (under Wine) has focus in full screen. *(Claude's call)* Check this first, before building the unlock/hide interaction on top of it. If shortcuts don't fire, the tray/menu-bar menu's Unlock/Hide items are the fallback, and we revisit the interaction with the user.

## Left to the builder

- Default shortcut keys. They must work while a full-screen game has focus and be unlikely to clash with MapleStory or common apps. Something like Ctrl+Shift+<letter> on Windows and ⌘⇧/⌃⌥ on macOS. Pick sensible ones and note them in the README.
- How the font picker works: a list of installed system fonts if practical, otherwise a curated list plus free text.
- Settings storage: a JSON file in the app's user-data directory is fine.
- Packaging tool (for example electron-builder or Electron Forge) and the Electron version (current stable).
- Settings window layout and styling. Keep it plain and functional. It should be a normal focusable window and is not itself always-on-top over games.
- How the unlock-mode box looks, as long as it's clearly visible and goes away when locked.
- Repository layout, build scripts, and how much automated testing to add. The overlay behavior itself can only be verified by hand over a full-screen game.
- Whether to keep the 2 s top-most re-assert or replace it with something event-driven, as long as the result still stays on top over the game.
