const { contextBridge, ipcRenderer } = require('electron');
// Expose a narrow bridge for source analysis and batch downloads.
contextBridge.exposeInMainWorld('djAPI', {
  checkBinaries: () => ipcRenderer.invoke('check-binaries'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (dirPath) => ipcRenderer.invoke('open-folder', dirPath),
  parseInput: (input) => ipcRenderer.invoke('parse-input', input),
  fetchMetadata: (selectedIndices) => ipcRenderer.invoke('fetch-metadata', selectedIndices),
  cancelMetadata: () => ipcRenderer.invoke('cancel-metadata'),
  startDownload: (options) => ipcRenderer.invoke('start-download', options),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

  onTrackProgress: (callback) => {
    ipcRenderer.on('track-progress', (_, data) => callback(data));
  },
  onMetadataProgress: (callback) => {
    ipcRenderer.on('metadata-progress', (_, data) => callback(data));
  },
  onMetadataCompleted: (callback) => {
    ipcRenderer.on('metadata-completed', (_, data) => callback(data));
  },
  onTrackCompleted: (callback) => {
    ipcRenderer.on('track-completed', (_, data) => callback(data));
  },
  onLog: (callback) => {
    ipcRenderer.on('log', (_, msg) => callback(msg));
  },
  onBatchCompleted: (callback) => {
    ipcRenderer.on('batch-completed', (_, summary) => callback(summary));
  }
});
