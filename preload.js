const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanFits: (dir) => ipcRenderer.invoke('scan-fits', dir),
  cancelScan: () => ipcRenderer.invoke('cancel-scan'),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', callback)
});
