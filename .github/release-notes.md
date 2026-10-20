**Overlay Clock is now Game Overlay**, with a new **meowdb panel** next to the clock.

### Upgrading from Overlay Clock
1. Install Game Overlay. Your clock settings carry over automatically.
2. Quit and uninstall **Overlay Clock**, because both apps use the same clock shortcuts. If you had *Start at login* on, Game Overlay turns it on for itself. On Windows, turn it off in Overlay Clock's settings before uninstalling so the old entry doesn't linger.
3. **macOS:** the first time you open it, allow it in System Settings → Privacy & Security, or run `xattr -dr com.apple.quarantine "/Applications/Game Overlay.app"` once.
   **Windows:** click "More info", then "Run anyway".

### New: meowdb panel
- **⌃⌥M (Ctrl+Alt+M on Windows):** activate or deactivate. When active it has an orange border, and your keys go to the panel.
- **⌃⌥N (Ctrl+Alt+N on Windows):** hide or show.
- When active, drag the toolbar to move the panel and drag its edges to resize it.
- Clicking the game drops the panel back to passive.

See the README for the details.
