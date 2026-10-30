### Fixed
- **EXP tracker:** on some screens the panel kept saying "Can't find the EXP bar" or "not sure of the numbers yet" while the game was right there. The live screen capture can soften colours slightly, which threw off how the tracker lined up the EXP digits. It now reads them as reliably live as on a screenshot.

### Upgrading
- **From 0.3.0 or 0.2.x:** install over it. Your settings and EXP history carry over.
- **From Overlay Clock:** install Game Overlay, then quit and uninstall Overlay Clock (see the README).
- **macOS:** allow the app once in System Settings → Privacy & Security, or run `xattr -dr com.apple.quarantine "/Applications/Game Overlay.app"`. If the EXP tracker stops finding the EXP bar after the update, remove Game Overlay from Screen & System Audio Recording with **−**, add it again with **+**, and reopen the app (see the README).
