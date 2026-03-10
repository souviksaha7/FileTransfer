const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion: () => process.versions.electron,
  getNodeVersion: () => process.versions.node,
  getPlatform: () => process.platform,
  getAppVersion: () => require('./package.json').version
});
