const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('captureApi', {
  onGrab: (cb) => ipcRenderer.on('capture:grab', (_e, request) => cb(request)),
  sendFrame: (frame) => ipcRenderer.send('capture:frame', frame),
  sendError: (message) => ipcRenderer.send('capture:error', message),
});
