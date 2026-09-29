const { contextBridge, ipcRenderer } = require('electron');
// Expose a narrow bridge for source analysis and batch downloads.
contextBridge.exposeInMainWorld('djAPI', {
  cancelImport: () => ipcRenderer.invoke('cancel-import'),
  reviewAudio: (id, decision) => ipcRenderer.invoke('review-audio', id, decision),
  previewUrl: id => 'deckprep-audio://track/' + encodeURIComponent(id),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),
  openReleases: () => ipcRenderer.invoke('open-releases'),
  onFlushBeforeClose: callback => ipcRenderer.on('flush-before-close', callback),
  acknowledgeFlush: success => ipcRenderer.send('renderer-flushed', success),
  checkBinaries: () => ipcRenderer.invoke('check-binaries'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSavedSession: () => ipcRenderer.invoke('get-saved-session'),
  saveSession: session => ipcRenderer.invoke('save-session', session),
  restoreSession: () => ipcRenderer.invoke('restore-session'),
  cancelRestore: () => ipcRenderer.invoke('cancel-restore'),
  clearSession: () => ipcRenderer.invoke('clear-session'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (dirPath) => ipcRenderer.invoke('open-folder', dirPath),
  openSourceLink: url => ipcRenderer.invoke('open-source-link', url),
  parseInput: (input) => ipcRenderer.invoke('parse-input', input),
  fetchMetadata: (selectedIndices) => ipcRenderer.invoke('fetch-metadata', selectedIndices),
  cancelMetadata: () => ipcRenderer.invoke('cancel-metadata'),
  findMatches: (indices, concurrency, force = false) => ipcRenderer.invoke('find-matches', { indices, concurrency, force }),
  cancelMatches: () => ipcRenderer.invoke('cancel-matches'),
  chooseMatch: (index, url) => ipcRenderer.invoke('choose-match', index, url),
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
  onMatchProgress: callback => { ipcRenderer.on('match-progress', (_, data) => callback(data)); },
  onMatchCompleted: callback => { ipcRenderer.on('match-completed', (_, data) => callback(data)); },
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
