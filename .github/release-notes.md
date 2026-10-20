### New: EXP tracker
- A new panel reads your EXP bar and the minimap's map name off the screen and shows **EXP per hour**, EXP gained, session time, time to level and the last 5 minutes' rate.
- Sessions start with **Start session** (⌃⌥S / Ctrl+Alt+S) or by themselves once you gain EXP steadily, pause after 45 seconds without EXP, and end when you change maps. **History** keeps your sessions for each map, with your best rate.
- Works at any resolution, full screen or windowed. It only looks at the screen; it never touches the game.
- **macOS:** allow Game Overlay in System Settings → Privacy & Security → Screen & System Audio Recording (the panel has a button for it). See the README if it stops working after an update.

### Fixed
- **Windows:** the meowdb panel can be made smaller again by dragging its edges (it could only grow).

### Upgrading
- **From 0.2.x:** install over it. Your settings carry over.
- **From Overlay Clock:** install Game Overlay, then quit and uninstall Overlay Clock (see the README).
- **macOS:** allow the app once in System Settings → Privacy & Security, or run `xattr -dr com.apple.quarantine "/Applications/Game Overlay.app"`.
