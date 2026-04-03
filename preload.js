const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanFits: (dir) => ipcRenderer.invoke('scan-fits', dir),
  // cancelScan: () => ipcRenderer.invoke('cancel-scan'),
  organizeStacked: (dir) => ipcRenderer.invoke('organize-stacked', dir),
  removeJpg: (dir) => ipcRenderer.invoke('remove-jpg', dir),
  cancelAll: () => ipcRenderer.invoke('cancel-all'),
  cancelRemoveJpg: () => ipcRenderer.invoke('cancel-remove-jpg'),
  onRemoveProgress: (callback) => ipcRenderer.on('remove-progress', callback),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', callback)
});
