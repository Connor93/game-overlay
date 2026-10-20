const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  onSettings: (cb) => ipcRenderer.on('overlay:settings', (_e, settings) => cb(settings)),
  onLocked: (cb) => ipcRenderer.on('overlay:locked', (_e, locked) => cb(locked)),
  sendSize: (size) => ipcRenderer.send('overlay:size', size),
});
