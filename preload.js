const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  togglePin: () => ipcRenderer.invoke('toggle-pin'),
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  setOpacity: (v) => ipcRenderer.send('set-opacity', v),
  onPinState: (cb) => ipcRenderer.on('pin-state', (e, v) => cb(v)),
});
