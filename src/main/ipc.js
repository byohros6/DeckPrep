import { app, ipcMain, dialog, shell } from 'electron';
import os from 'node:os';
import fs from 'node:fs';
import { checkBinaries } from './engine/binaryManager.js';
import { parseInput, fetchTrackDetails } from './engine/sources.js';
import { DownloadQueue, verifyMp3File } from './engine/downloadQueue.js';
import { findAudioMatches, rankCandidates } from './engine/matching.js';
import { readSession, saveSession, clearSession } from './sessionStore.js';

let activeQueue = null;
let currentMainWindow = null;
let registered = false;
let selectedDestination = null;
let parsedTracks = [];
let activeMetadata = null;
let activeMatching = null;
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
  ipcMain.handle('get-saved-session', readSession);
  ipcMain.handle('save-session', (_, session) => saveSession(session));
  ipcMain.handle('clear-session', async () => { await clearSession(); parsedTracks = []; selectedDestination = null; });
  ipcMain.handle('restore-session', async () => {
    if (activeQueue || activeMetadata || activeMatching || activeParse) return { success: false, error: 'Wait for the current task first' };
    const session = await readSession();
    if (!session) return { success: false, error: 'No saved session' };
    let reusedMatches = 0;
    session.tracks = session.tracks.map((track, index) => {
      const restored = { ...track, index: index + 1 };
      if (['done', 'skipped'].includes(restored.status)) {
        try { if (!restored.outputPath) throw new Error('No output'); verifyMp3File(restored.outputPath); }
        catch { restored.status = 'pending'; restored.outputPath = null; }
      }
      if (['resolving', 'searching', 'downloading', 'transcoding', 'tagging'].includes(restored.status)) restored.status = 'pending';
      if (!restored.directUrl && !restored.matchUrl && restored.candidates?.length) {
        const ranked = rankCandidates(restored, restored.candidates);
        restored.candidates = ranked.candidates;
        if (ranked.chosen) {
          restored.matchUrl = ranked.chosen.url;
          restored.matchState = 'matched';
          restored.matchError = null;
          reusedMatches++;
        }
      }
      return restored;
    });
    parsedTracks = session.tracks.map(track => ({ ...track }));
    selectedDestination = session.destinationDir && fs.existsSync(session.destinationDir) ? session.destinationDir : null;
    return { success: true, session: { ...session, destinationDir: selectedDestination || '', reusedMatches } };
  });
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
  ipcMain.handle('open-source-link', async (_, rawUrl) => {
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || !['soundcloud.com', 'on.soundcloud.com', 'youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be', 'open.spotify.com', 'music.apple.com'].includes(host)) {
        throw new Error('Unsupported source link');
      }
      await shell.openExternal(url.href);
      return { success: true };
    } catch { return { success: false, error: 'Could not open this source link' }; }
  });
  ipcMain.handle('parse-input', async (_, rawInput) => {
    if (activeParse || activeMetadata || activeMatching || activeQueue) return { success: false, error: 'Wait for the current task to finish or cancel it first' };
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
  ipcMain.handle('find-matches', (_, request) => {
    if (activeParse || activeMetadata || activeMatching || activeQueue) return { success: false, error: 'Another task is already running' };
    const selectedIndices = Array.isArray(request) ? request : request?.indices;
    if (!Array.isArray(selectedIndices) || !selectedIndices.every(Number.isSafeInteger)) return { success: false, error: 'Select valid tracks first' };
    const ids = new Set(selectedIndices);
    const tracks = parsedTracks.filter(track => ids.has(track.index) && !track.directUrl && !track.matchUrl);
    if (!tracks.length) return { success: false, error: 'No selected tracks need matches' };
    const job = { controller: new AbortController(), next: 0, completed: 0, errors: 0, total: tracks.length };
    activeMatching = job;
    const worker = async () => {
      while (!job.controller.signal.aborted && job.next < tracks.length) {
        const track = tracks[job.next++];
        try {
          const result = await findAudioMatches(track, job.controller.signal);
          track.candidates = result.candidates;
          track.matchUrl = result.chosen?.url || null;
          track.matchState = result.chosen ? 'matched' : 'review';
          track.matchError = null;
        } catch (err) {
          if (job.controller.signal.aborted) return;
          track.matchState = 'error';
          track.matchError = err.message;
          job.errors++;
        }
        job.completed++;
        send('match-progress', { track, completed: job.completed, total: job.total, errors: job.errors });
      }
    };
    const requestedConcurrency = Math.max(1, Math.min(12, Number(request?.concurrency) || 4));
    const workers = Math.min(tracks.length, 6, Math.max(1, Math.round(requestedConcurrency * 0.75)));
    Promise.all(Array.from({ length: workers }, worker)).finally(() => {
      if (activeMatching === job) activeMatching = null;
      send('match-completed', { completed: job.completed, total: job.total, errors: job.errors, cancelled: job.controller.signal.aborted });
    });
    return { success: true, total: tracks.length, workers };
  });
  ipcMain.handle('cancel-matches', () => {
    if (!activeMatching) return { success: false, error: 'No match search is running' };
    activeMatching.controller.abort();
    return { success: true };
  });
  ipcMain.handle('choose-match', (_, index, url) => {
    const track = parsedTracks.find(item => item.index === index);
    if (!track || !track.candidates?.some(candidate => candidate.url === url)) return { success: false, error: 'That match is no longer available' };
    track.matchUrl = url;
    track.matchState = 'chosen';
    track.matchError = null;
    return { success: true, track };
  });
  ipcMain.handle('start-download', async (_, options) => {
    if (activeQueue) return { success: false, error: 'A batch is already running' };
    if (activeParse || activeMetadata || activeMatching) return { success: false, error: 'Wait for track review to finish' };
    if (!parsedTracks.length) return { success: false, error: 'Analyze a link or tracklist first' };
    if (!Array.isArray(options?.selectedIndices) || !options.selectedIndices.length || !options.selectedIndices.every(Number.isSafeInteger)) {
      return { success: false, error: 'Select at least one track' };
    }
    const selectedIds = new Set(options.selectedIndices);
    if (selectedIds.size !== options.selectedIndices.length) return { success: false, error: 'Track selection is out of date' };
    const selectedTracks = parsedTracks.filter(track => selectedIds.has(track.index));
    if (selectedTracks.length !== selectedIds.size) return { success: false, error: 'Track selection is out of date; reload the queue' };
    if (selectedTracks.some(track => track.needsMetadata)) return { success: false, error: 'Fetch details for selected tracks before downloading' };
    if (selectedTracks.some(track => !track.directUrl && !track.matchUrl)) return { success: false, error: 'Review audio matches for selected tracks before downloading' };
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
