import { app, ipcMain, dialog, shell } from 'electron';
import os from 'node:os';
import fs from 'node:fs';
import { checkBinaries } from './engine/binaryManager.js';
import { parseInput, fetchTrackDetails } from './engine/sources.js';
import { DownloadQueue } from './engine/downloadQueue.js';

let activeQueue = null;
let currentMainWindow = null;
let registered = false;
let selectedDestination = null;
let parsedTracks = [];
let activeMetadata = null;
let activeParse = false;

function owner() {
  return currentMainWindow && !currentMainWindow.isDestroyed() ? currentMainWindow : undefined;
}

function openDialog(options) {
  const win = owner();
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

function send(channel, payload) {
  if (owner()) currentMainWindow.webContents.send(channel, payload);
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
    if (activeParse || activeMetadata || activeQueue) return { success: false, error: 'Wait for the current task to finish or cancel it first' };
    activeParse = true;
    try {
      const result = await parseInput(rawInput);
      parsedTracks = result.tracks.map((track, index) => ({ ...track, index: index + 1 }));
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      activeParse = false;
    }
  });
  ipcMain.handle('fetch-metadata', (_, selectedIndices) => {
    if (activeParse || activeQueue || activeMetadata) return { success: false, error: 'Another task is already running' };
    if (!Array.isArray(selectedIndices) || !selectedIndices.every(Number.isSafeInteger)) return { success: false, error: 'Select valid tracks first' };
    const ids = new Set(selectedIndices);
    if (ids.size !== selectedIndices.length || ids.size > parsedTracks.length) return { success: false, error: 'Track selection is out of date' };
    if (parsedTracks.filter(track => ids.has(track.index)).length !== ids.size) return { success: false, error: 'Track selection is out of date' };
    const tracks = parsedTracks.filter(track => ids.has(track.index) && track.needsMetadata);
    if (!tracks.length) return { success: false, error: 'No selected tracks need details' };
    const job = { controller: new AbortController(), next: 0, completed: 0, errors: 0, total: tracks.length };
    activeMetadata = job;
    const worker = async () => {
      while (!job.controller.signal.aborted && job.next < tracks.length) {
        const track = tracks[job.next++];
        try {
          const details = await fetchTrackDetails(track, job.controller.signal);
          Object.assign(track, details, { metadataError: null });
        } catch (err) {
          if (job.controller.signal.aborted) return;
          track.metadataError = err.message;
          job.errors++;
        }
        job.completed++;
        send('metadata-progress', { track, completed: job.completed, total: job.total, errors: job.errors });
      }
    };
    const workers = tracks.every(track => track.source === 'soundcloud' && track.soundcloudId) ? 8 : 4;
    Promise.all(Array.from({ length: Math.min(workers, tracks.length) }, worker)).finally(() => {
      if (activeMetadata === job) activeMetadata = null;
      send('metadata-completed', { completed: job.completed, total: job.total, errors: job.errors, cancelled: job.controller.signal.aborted });
    });
    return { success: true, total: tracks.length };
  });
  ipcMain.handle('cancel-metadata', () => {
    if (!activeMetadata) return { success: false, error: 'No details lookup is running' };
    activeMetadata.controller.abort();
    return { success: true };
  });
  ipcMain.handle('start-download', async (_, options) => {
    if (activeQueue) return { success: false, error: 'A batch is already running' };
    if (activeParse || activeMetadata) return { success: false, error: 'Wait for track details to finish' };
    if (!parsedTracks.length) return { success: false, error: 'Analyze a link or tracklist first' };
    if (!Array.isArray(options?.selectedIndices) || !options.selectedIndices.length || !options.selectedIndices.every(Number.isSafeInteger)) {
      return { success: false, error: 'Select at least one track' };
    }
    const selectedIds = new Set(options.selectedIndices);
    if (selectedIds.size !== options.selectedIndices.length) return { success: false, error: 'Track selection is out of date' };
    const selectedTracks = parsedTracks.filter(track => selectedIds.has(track.index));
    if (selectedTracks.length !== selectedIds.size) return { success: false, error: 'Track selection is out of date; reload the queue' };
    if (selectedTracks.some(track => track.needsMetadata)) return { success: false, error: 'Fetch details for selected tracks before downloading' };
    if (options.destinationDir !== selectedDestination || !selectedDestination || !fs.existsSync(selectedDestination)) {
      return { success: false, error: 'Choose a destination folder' };
    }
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
    queue.load(selectedTracks);
    queue.start();
    return { success: true };
  });
  ipcMain.handle('cancel-download', () => {
    if (!activeQueue) return { success: false, error: 'No active batch' };
    activeQueue.cancel();
    return { success: true };
  });
}
