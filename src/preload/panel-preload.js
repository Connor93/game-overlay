const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panelApi', {
  onState: (cb) => ipcRenderer.on('panel:state', (_e, state) => cb(state)),
  nav: (action) => ipcRenderer.send('panel:nav', action),
  resizeStart: () => ipcRenderer.send('panel:resize-start'),
  resize: (size) => ipcRenderer.send('panel:resize', size),
  resizeEnd: () => ipcRenderer.send('panel:resize-end'),
});
