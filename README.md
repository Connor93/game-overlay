# Game Overlay

Tools that float above everything on your screen, including games in full screen:

- **Clock:** your local time as outlined text on a transparent background. Clicks pass straight through it.
- **meowdb panel:** [meowdb.com/msclassic](https://meowdb.com/msclassic) in a small window, so you can look up drops, items and training spots without leaving the game.

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

## Using it

Everything is controlled from the icon in the menu bar (macOS) or system tray (Windows), and with these shortcuts:

| What | macOS | Windows |
| --- | --- | --- |
| Clock: unlock to move / lock | ⌃⌥C | Ctrl+Alt+C |
| Clock: hide / show | ⌃⌥H | Ctrl+Alt+H |
| meowdb: activate / deactivate | ⌃⌥M | Ctrl+Alt+M |
| meowdb: hide / show | ⌃⌥N | Ctrl+Alt+N |

Every shortcut can be changed in **Settings**.

### The meowdb panel

The panel is always in one of two states:

- **Passive** (normal): slightly see-through, with no border. Clicks go through it, and your keyboard goes to the game.
- **Active** (press ⌃⌥M / Ctrl+Alt+M): an **orange border** and an **ACTIVE** tag appear, along with a toolbar (Back, Forward, Home, Reload). Your keyboard and mouse now go to the panel, so you can search and click around.
  - **To move it:** drag the toolbar.
  - **To resize it:** drag the right edge, the bottom edge, or the bottom-right corner.

To go back to the game, press the shortcut again, or just click the game. The panel drops back to passive by itself.

The panel remembers its position, its size, the last page you were on, and your meowdb login. Links to other websites open in your normal browser.

### The clock

To move the clock, press the unlock shortcut. A dashed box appears, and you can drag the clock anywhere, including onto another monitor. Press the shortcut again to lock it in place.

Settings lets you change the clock's font, size, colors, outline, opacity, seconds, 12/24-hour format, and which monitor it's on.

If a monitor is disconnected, anything that was on it moves to your main screen.

## Games

Game Overlay is a set of ordinary always-on-top windows. **It never touches, reads, or injects into any game**, so it can't trigger anti-cheat.

On Windows, some games use "exclusive fullscreen", and no normal window can appear on top of that. If you can't see the overlay in a game, set the game's display mode to **borderless** or **windowed fullscreen**.

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
