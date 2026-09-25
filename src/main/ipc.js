import { app, ipcMain, dialog, shell } from 'electron';
import os from 'node:os';
import fs from 'node:fs';
import { checkBinaries } from './engine/binaryManager.js';
import { parseInput } from './engine/sources.js';
import { DownloadQueue } from './engine/downloadQueue.js';

let activeQueue = null;
let currentMainWindow = null;
let registered = false;
let selectedDestination = null;
let parsedTracks = [];

function owner() {
  return currentMainWindow && !currentMainWindow.isDestroyed() ? currentMainWindow : undefined;
}

function openDialog(options) {
  const win = owner();
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

export function registerIpcHandlers(mainWindow) {
  currentMainWindow = mainWindow;
  if (registered) return;
  registered = true;

  ipcMain.handle('check-binaries', checkBinaries);
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-system-info', () => {
    const cpuCores = os.cpus()?.length || 4;
    return { cpuCores, defaultConcurrency: Math.min(4, Math.max(1, cpuCores - 2)) };
  });
  ipcMain.handle('select-folder', async () => {
    const result = await openDialog({
      properties: ['openDirectory', 'createDirectory'], title: 'Choose a destination folder'
    });
    if (result.canceled) return null;
    selectedDestination = result.filePaths[0];
    return selectedDestination;
  });
  ipcMain.handle('open-folder', async (_, folder) => {
    if (folder === selectedDestination && fs.existsSync(folder)) return shell.openPath(folder);
    return 'Choose a destination folder first';
  });
  ipcMain.handle('parse-input', async (_, rawInput) => {
    try {
      const result = await parseInput(rawInput);
      parsedTracks = result.tracks;
      return { success: true, ...result };
    } catch (err) {
      parsedTracks = [];
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('start-download', async (_, options) => {
    if (activeQueue) return { success: false, error: 'A batch is already running' };
    if (!parsedTracks.length) return { success: false, error: 'Analyze a link or tracklist first' };
    if (options.destinationDir !== selectedDestination || !fs.existsSync(selectedDestination)) {
      return { success: false, error: 'Choose a destination folder' };
    }
    const send = (channel, payload) => {
      if (owner()) currentMainWindow.webContents.send(channel, payload);
    };
    const queue = new DownloadQueue({
      destinationDir: selectedDestination,
      concurrency: options.concurrency,
      mode: options.mode,
      onTrackProgress: track => send('track-progress', track),
      onTrackCompleted: track => send('track-completed', track),
      onLog: message => send('log', message),
      onAllCompleted: summary => {
        if (activeQueue === queue) activeQueue = null;
        send('batch-completed', summary);
        if (!summary.cancelled && summary.destinationDir) shell.openPath(summary.destinationDir);
      }
    });
    activeQueue = queue;
    queue.load(parsedTracks);
    queue.start();
    return { success: true };
  });
  ipcMain.handle('cancel-download', () => {
    if (!activeQueue) return { success: false, error: 'No active batch' };
    activeQueue.cancel();
    return { success: true };
  });
}
