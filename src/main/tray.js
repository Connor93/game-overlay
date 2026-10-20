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

// `getSections` returns one array of menu items per tool; they're shown in order, separated.
function createTray({ getSections, openSettings, quit }) {
  const tray = new Tray(trayIcon());
  tray.setToolTip('Game Overlay');

  function refresh() {
    const template = [];
    for (const items of getSections()) template.push(...items, { type: 'separator' });
    template.push({ label: 'Settings…', click: openSettings }, { type: 'separator' }, { label: 'Quit Game Overlay', click: quit });
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  // Windows only opens the context menu on right-click by default; open it on left-click too.
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());

  refresh();
  return { tray, refresh };
}

module.exports = { createTray };
