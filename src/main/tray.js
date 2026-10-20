const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');

function trayIcon() {
  if (process.platform === 'darwin') {
    // "Template" in the name lets macOS recolor it for light/dark menu bars; @2x is picked up automatically.
    const image = nativeImage.createFromPath(path.join(__dirname, '../assets/trayTemplate.png'));
    image.setTemplateImage(true);
    return image;
  }
  return nativeImage.createFromPath(path.join(__dirname, '../assets/tray-win.png')).resize({ width: 16, height: 16 });
}

function createTray({ overlay, openSettings, quit }) {
  const tray = new Tray(trayIcon());
  tray.setToolTip('Overlay Clock');

  function refresh() {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: overlay.isLocked() ? 'Unlock to move' : 'Lock',
          click: () => {
            if (overlay.isLocked() && overlay.isHidden()) overlay.setHidden(false);
            overlay.setLocked(!overlay.isLocked());
            refresh();
          },
        },
        {
          label: overlay.isHidden() ? 'Show' : 'Hide',
          click: () => {
            overlay.setHidden(!overlay.isHidden());
            refresh();
          },
        },
        { type: 'separator' },
        { label: 'Settings…', click: openSettings },
        { type: 'separator' },
        { label: 'Quit Overlay Clock', click: quit },
      ]),
    );
  }

  // Windows only opens the context menu on right-click by default; open it on left-click too.
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());

  refresh();
  return { tray, refresh };
}

module.exports = { createTray };
