const { contextBridge, ipcRenderer } = require('electron');

// Shell API (shared with other panels) — channels prefixed 'exp:'.
contextBridge.exposeInMainWorld('panelApi', {
  onState: (cb) => ipcRenderer.on('exp:state', (_e, state) => cb(state)),
  resizeStart: () => ipcRenderer.send('exp:resize-start'),
  resize: (size) => ipcRenderer.send('exp:resize', size),
  resizeEnd: () => ipcRenderer.send('exp:resize-end'),
});

contextBridge.exposeInMainWorld('expApi', {
  startStop: () => ipcRenderer.send('exp:start-stop'),
  setTab: (tab) => ipcRenderer.send('exp:tab', tab),
  openMap: (name) => ipcRenderer.send('exp:open-map', name),
  nameMap: (name) => ipcRenderer.send('exp:name-map', name),
  renameSession: (id, map) => ipcRenderer.send('exp:rename', { id, map }),
  deleteSession: (id) => ipcRenderer.send('exp:delete', id),
  openPermissionSettings: () => ipcRenderer.send('exp:permission-settings'),
  relocate: () => ipcRenderer.send('exp:relocate'),
});
