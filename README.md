# Game Overlay

Tools that float above everything on your screen, including games in full screen:

- **Clock:** your local time as outlined text on a transparent background. Clicks pass straight through it.
- **meowdb panel:** [meowdb.com/msclassic](https://meowdb.com/msclassic) in a small window, so you can look up drops, items and training spots without leaving the game.
- **EXP tracker:** reads your EXP bar and the minimap's map name off the screen, and shows EXP per hour, EXP gained and time to level, with a history of your sessions on each map.

It runs on **macOS** and **Windows**. (It used to be called Overlay Clock.)

## Install

Download the latest version from the [Releases page](https://github.com/Connor93/game-overlay/releases/latest):

| System | File |
| --- | --- |
| macOS (Apple Silicon or Intel) | `Game-Overlay-<version>-universal.dmg` |
| Windows (installer) | `Game-Overlay-Setup-<version>.exe` |
| Windows (no install, run directly) | `Game-Overlay-<version>.exe` |

### Upgrading from Overlay Clock

Your clock settings come over automatically the first time Game Overlay starts. After that:

- **Quit Overlay Clock** (menu bar or tray icon → Quit Overlay Clock).
- **Uninstall it**: on a Mac, drag it from Applications to the Trash; on Windows, use Settings → Apps.

Both apps use the same clock shortcuts, so leaving Overlay Clock running makes the shortcuts do things twice. If you had *Start at login* on, Game Overlay turns it on for itself. On Windows, turn it off in Overlay Clock before uninstalling so its old login entry doesn't linger.

### First launch

The app isn't signed with a paid Apple or Microsoft certificate, so your system will warn you the first time you open it.

**macOS:** Open the `.dmg` and drag Game Overlay into Applications, then open it. When macOS says it can't verify the app, click **Done**. Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Game Overlay. You only need to do this once.

Or run this once in Terminal instead:

```sh
xattr -dr com.apple.quarantine "/Applications/Game Overlay.app"
```

**Windows:** If you see "Windows protected your PC", click **More info**, then **Run anyway**.

### Screen Recording permission (macOS, for the EXP tracker)

The EXP tracker reads the screen, so macOS has to allow Game Overlay to record it. If the panel says **Allow Screen Recording for Game Overlay**:

1. Click that button. It opens **System Settings → Privacy & Security → Screen & System Audio Recording**.
2. Turn on **Game Overlay**. If it isn't listed, click **+** and pick it from Applications.
3. Quit Game Overlay and open it again.

**After every update,** macOS may quietly stop letting Game Overlay see the screen, even though the switch still looks on (the app isn't signed with a paid certificate, so macOS treats each version as a new app). If the EXP tracker stops finding the EXP bar after an update, select Game Overlay in that list, remove it with **−**, add it again with **+**, and reopen the app.

Windows doesn't need a permission.

## Using it

Everything is controlled from the icon in the menu bar (macOS) or system tray (Windows), and with these shortcuts:

| What | macOS | Windows |
| --- | --- | --- |
| Clock: unlock to move / lock | ⌃⌥C | Ctrl+Alt+C |
| Clock: hide / show | ⌃⌥H | Ctrl+Alt+H |
| meowdb: activate / deactivate | ⌃⌥M | Ctrl+Alt+M |
| meowdb: hide / show | ⌃⌥N | Ctrl+Alt+N |
| EXP tracker: activate / deactivate | ⌃⌥E | Ctrl+Alt+E |
| EXP tracker: hide / show | ⌃⌥R | Ctrl+Alt+R |
| EXP tracker: start / stop a session | ⌃⌥S | Ctrl+Alt+S |

Every shortcut can be changed in **Settings**.

### The meowdb panel

The panel is always in one of two states:

- **Passive** (normal): slightly see-through, with no border. Clicks go through it, and your keyboard goes to the game.
- **Active** (press ⌃⌥M / Ctrl+Alt+M): an **orange border** and an **ACTIVE** tag appear, along with a toolbar (Back, Forward, Home, Reload). Your keyboard and mouse now go to the panel, so you can search and click around.
  - **To move it:** drag the toolbar.
  - **To resize it:** drag the right edge, the bottom edge, or the bottom-right corner.

To go back to the game, press the shortcut again, or just click the game. The panel drops back to passive by itself.

The panel remembers its position, its size, the last page you were on, and your meowdb login. Links to other websites open in your normal browser.

**Ads:** the panel blocks ads by default. meowdb is family-run and supported by its ads, so if you'd like to support it, turn off **Block ads** in Settings → meowdb panel.

### The EXP tracker

The EXP tracker is a panel like meowdb's, passive and active in the same way (⌃⌥E / Ctrl+Alt+E). It has two tabs:

- **Live:** the current map, your EXP per hour, EXP gained, session time, roughly how long until you level, and the rate over the last 5 minutes.
- **History** (while active): every map you've trained on, with your best rate there. Click a map to see its sessions, where you can rename or delete them.

**Sessions** start when you press **Start session** (or ⌃⌥S / Ctrl+Alt+S), or by themselves once you gain EXP steadily for about 20 seconds. You can turn the automatic start off in Settings.

- After 45 seconds without EXP the session pauses; your next EXP gain resumes it.
- Changing maps ends the session. It never starts a new one: a new session starts once you're gaining EXP steadily again.
- **Stop session** ends it, and the tracker won't start one by itself again until you change maps.
- Sessions shorter than a minute aren't saved.

**What it needs to see:** the EXP numbers along the bottom of the game, and the map name in the minimap. Keep the minimap open, and keep the meowdb panel (or anything else) off both. If the tracker can't read the map name, it asks you to type one.

It works at any resolution, full screen or windowed. If it keeps saying it can't read the EXP bar after you change resolution or move the game to another monitor, use **Settings → EXP tracker → Find EXP bar again**.

**Privacy:** the tracker looks at small parts of the screen every few seconds, in memory. Nothing is saved or sent anywhere; only your session results are kept, on your computer.

### The clock

To move the clock, press the unlock shortcut. A dashed box appears, and you can drag the clock anywhere, including onto another monitor. Press the shortcut again to lock it in place.

Settings lets you change the clock's font, size, colors, outline, opacity, seconds, 12/24-hour format, and which monitor it's on.

If a monitor is disconnected, anything that was on it moves to your main screen.

## Games

Game Overlay is a set of ordinary always-on-top windows. **It never touches, reads the memory of, or injects into any game**, so it can't trigger anti-cheat. The EXP tracker only looks at what's on your screen, like taking a screenshot.

On Windows, some games use "exclusive fullscreen", and no normal window can appear on top of that (and the EXP tracker can't see the game either). If you can't see the overlay in a game, set the game's display mode to **borderless** or **windowed fullscreen**.

**On Windows:** if your keys don't go back to the game after you deactivate the meowdb panel, click the game once. Please report it if that happens.

## Development

```sh
npm install
npm start          # run the app
npm test           # unit tests
npm run dist       # build installers for the current OS into dist/
```

### Releasing

Pushing a version tag builds the macOS and Windows versions on GitHub Actions and attaches them to a GitHub Release:

```sh
npm version patch   # or minor / major
git push --follow-tags
```

If a build job sits waiting for a runner and gets cancelled, re-run the failed jobs:

```sh
gh run rerun <run-id> --failed
```
