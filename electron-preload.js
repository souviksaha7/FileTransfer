const { contextBridge, ipcMain } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => process.versions.electron,
  getNodeVersion: () => process.versions.node,
  getPlatform: () => process.platform,
  getAppVersion: () => require('./package.json').version
});
