# Overlay Clock

A small clock that floats above everything on your screen, including games in full screen. It has a transparent background, clicks pass straight through it, and you can change its size, font, colors, outline, and position.

It runs on **macOS** and **Windows**.

## Install

Download the latest version from the [Releases page](https://github.com/Connor93/overlay-clock/releases/latest):

| System | File |
| --- | --- |
| macOS (Apple Silicon or Intel) | `Overlay-Clock-<version>-universal.dmg` |
| Windows (installer) | `Overlay-Clock-Setup-<version>.exe` |
| Windows (no install, run directly) | `Overlay-Clock-<version>.exe` |

### First launch

The app isn't signed with a paid Apple or Microsoft certificate, so your system will warn you the first time you open it.

**macOS:** Open the `.dmg` and drag Overlay Clock into Applications, then open it. When macOS says it can't verify the app, click **Done**. Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Overlay Clock. You only need to do this once.

**Windows:** If you see "Windows protected your PC", click **More info**, then **Run anyway**.

## Using it

The clock starts in the top-right corner of your main screen. It has no window or Dock icon. You control it from the clock icon in the menu bar (macOS) or the system tray (Windows).

| What | macOS | Windows |
| --- | --- | --- |
| Unlock to move / lock in place | ⌃⌥C (Control+Option+C) | Ctrl+Alt+C |
| Hide / show | ⌃⌥H (Control+Option+H) | Ctrl+Alt+H |

**To move the clock:** press the unlock shortcut. A dashed box appears around the clock, and you can drag it anywhere, including onto another monitor. Press the shortcut again to lock it, and clicks will go through to whatever is underneath. The clock remembers where you put it.

**Settings** (from the menu bar or tray icon) let you change:

- the font
- bold text
- the size
- the text and outline colors
- the outline thickness
- the opacity
- seconds on or off
- 12- or 24-hour time
- which monitor the clock is on
- both shortcuts
- starting at login

Changes show up on the clock right away.

If the monitor the clock was on is disconnected, the clock moves to your main screen. It goes back to that monitor when you plug it back in.

## Games

Overlay Clock is an ordinary always-on-top window. **It never touches, reads, or injects into any game**, so it can't trigger anti-cheat.

On Windows, some games use "exclusive fullscreen", and no normal window can appear on top of that. If you can't see the clock in a game, set the game's display mode to **borderless** or **windowed fullscreen**.

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
