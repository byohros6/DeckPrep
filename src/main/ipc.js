import { app, ipcMain, dialog, shell } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateSender, validSelection, validatePreferences, validateFolderName } from './security.js';
import fs from 'node:fs';
import { checkBinaries, engineVersions } from './engine/binaryManager.js';
import { parseInput, fetchTrackDetails } from './engine/sources.js';
import { DownloadQueue, verifyMp3File } from './engine/downloadQueue.js';
import { candidateVersionCompatible, findAudioMatches, rankCandidates } from './engine/matching.js';
import { readSession, saveSession, clearSession, flushSession } from './sessionStore.js';

let activeQueue = null;
let currentMainWindow = null;
let registered = false;
let selectedDestination = null;
let parsedTracks = [];
let activeMetadata = null;
let activeMatching = null;
let activeParse = null;
let activeRestore = null;
let sessionContext = {};
let progressSaveTimer;
const rendererUrl = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../renderer/index.html')).href;
const busy = () => activeQueue || activeMetadata || activeMatching || activeParse || activeRestore;
function outputDirectory(parent, folderName, create = false) {
  const name = validateFolderName(folderName || '');
  const directory = name ? path.join(parent, name) : parent;
  if (fs.existsSync(directory)) {
    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The output folder is not a regular folder');
  } else if (create) {
    fs.mkdirSync(directory);
  }
  return directory;
}
function persist() { return parsedTracks.length ? saveSession({...sessionContext, tracks: parsedTracks, destinationDir: selectedDestination || ''}) : Promise.resolve(); }
function installTracks(result) {
  if (!result.tracks.length) throw new Error(result.warning || 'No tracks could be imported');
  if (result.tracks.length > 10000) throw new Error('Queues are limited to 10,000 tracks');
  parsedTracks = result.tracks.map((track, index) => ({...track, id: randomUUID(), index: index + 1, selected: true, status: 'pending', requested: {title: track.title, artist: track.artist, mix: track.mix || '', durationSec: track.durationSec || 0}}));
  sessionContext = {source: result.source, collection: {title: result.title, creator: result.creator, artworkUrl: result.artworkUrl, sourceUrl: result.sourceUrl, warning: result.warning, totalCount: result.totalCount, incomplete: result.incomplete}};
  return {...result, tracks: parsedTracks};
}
export async function shutdownJobs() {
  clearTimeout(progressSaveTimer);
  activeParse?.abort(); activeMetadata?.controller.abort(); activeMatching?.controller.abort();
  const restore = activeRestore; restore?.controller.abort();
  const queue = activeQueue; queue?.cancel();
  if (restore?.completion) await restore.completion.catch(() => {});
  if (queue) await queue.completion;
  await persist(); await flushSession();
}
export function previewPath(id) {
  const track = parsedTracks.find(item => item.id === id);
  if (!track?.inspection || track.status !== 'audio_review') return null;
  const file = track?.reviewSourcePath || track?.localPath;
  if (!file || !fs.existsSync(file)) return null;
  return file;
}


function owner() {
  return currentMainWindow && !currentMainWindow.isDestroyed() ? currentMainWindow : undefined;
}

function openDialog(options) {
  const win = owner();
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

function send(channel, payload) {
  if (payload?.track) {
    const track = parsedTracks.find(item => item.id === payload.track.id);
    if (!track) return;
    Object.assign(track, payload.track);
  }
  if (channel.endsWith('progress') || channel.endsWith('completed')) {
    clearTimeout(progressSaveTimer);
    progressSaveTimer = setTimeout(() => persist().catch(error => { if (owner()) currentMainWindow.webContents.send('log', 'Could not save progress: ' + error.message); }), 150);
  }
  if (owner()) currentMainWindow.webContents.send(channel, payload);
}

export function registerIpcHandlers(mainWindow) {
  currentMainWindow = mainWindow;
  if (registered) return;
  registered = true;
  const handle = (channel, callback) => ipcMain.handle(channel, async (event, ...args) => {
    validateSender(event, owner()?.webContents, rendererUrl);
    return callback(event, ...args);
  });

  handle('check-binaries', checkBinaries);
  handle('get-app-version', () => app.getVersion());
  handle('get-saved-session', readSession);
  handle('save-session', async (_, session) => {
    if (!session || !Array.isArray(session.tracks) || session.tracks.length > 10000 || session.tracks.some(track => !track || typeof track.id !== 'string' || typeof track.selected !== 'boolean')) throw new Error('Invalid session');
    const preferences = validatePreferences(session);
    const byId = new Map(session.tracks.map(track => [track.id, track]));
    for (const track of parsedTracks) {
      const incoming = byId.get(track.id);
      if (incoming) { track.selected = incoming.selected !== false; track.duplicateOf = incoming.duplicateOf; }
    }
    Object.assign(sessionContext, preferences);
    await persist();
  });
  handle('clear-session', async () => { if (busy()) throw new Error('Stop the current task first'); parsedTracks = []; sessionContext = {}; selectedDestination = null; await clearSession(); });
  handle('restore-session', async () => {
    if (busy()) return { success: false, error: 'Wait for the current task first' };
    const restore = {controller: new AbortController(), completion: null};
    activeRestore = restore;
    const signal = restore.controller.signal;
    restore.completion = (async () => {
      const session = await readSession();
      signal.throwIfAborted();
      if (!session) return { success: false, error: 'No saved session' };
      let reusedMatches = 0;
      const restoredTracks = [];
      for (const [index, track] of session.tracks.entries()) {
        signal.throwIfAborted();
        const restored = { ...track, index: index + 1 };
        if (session.source === 'soundcloud' && restored.album === session.collection?.title) restored.album = '';
        if (['done', 'skipped'].includes(restored.status)) {
          try { if (!restored.outputPath) throw new Error('No output'); await verifyMp3File(restored.outputPath, {signal}); }
          catch { signal.throwIfAborted(); restored.status = 'pending'; restored.outputPath = null; }
        }
        if (['resolving', 'searching', 'downloading', 'transcoding', 'tagging', 'inspecting'].includes(restored.status)) restored.status = 'pending';
        const savedChoice = restored.candidates?.find(candidate => candidate.url === restored.matchUrl);
        if (savedChoice && !candidateVersionCompatible(restored, savedChoice)) {
          restored.matchUrl = null;
          restored.matchState = 'review';
          restored.matchError = 'The saved recording conflicts with the requested version; choose a compatible result.';
        }
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
        restoredTracks.push(restored);
      }
      signal.throwIfAborted();
      session.tracks = restoredTracks;
      sessionContext = {...session}; delete sessionContext.tracks;
      parsedTracks = restoredTracks;
      selectedDestination = session.destinationDir && fs.existsSync(session.destinationDir) ? session.destinationDir : null;
      return { success: true, session: { ...session, destinationDir: selectedDestination || '', reusedMatches } };
    })();
    try { return await restore.completion; }
    catch (error) { if (signal.aborted) return {success: false, cancelled: true, error: 'Restore stopped; saved session kept'}; throw error; }
    finally { if (activeRestore === restore) activeRestore = null; }
  });
  handle('cancel-restore', () => {
    if (!activeRestore) return {success: false, error: 'No restore is running'};
    activeRestore.controller.abort();
    return {success: true};
  });
  handle('get-system-info', () => {
    const cpuCores = os.cpus()?.length || 4;
    return { cpuCores, defaultConcurrency: Math.min(4, Math.max(1, cpuCores - 2)) };
  });
  handle('select-folder', async () => {
    const result = await openDialog({
      properties: ['openDirectory', 'createDirectory'], title: 'Choose a destination folder'
    });
    if (result.canceled) return null;
    selectedDestination = result.filePaths[0];
    return selectedDestination;
  });
  handle('open-folder', async (_, folder) => {
    if (folder === selectedDestination && fs.existsSync(folder)) {
      const directory = outputDirectory(folder, sessionContext.folderName);
      if (fs.existsSync(directory)) return shell.openPath(directory);
    }
    return 'Choose a destination folder first';
  });
  handle('open-source-link', async (_, rawUrl) => {
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
  handle('parse-input', async (_, rawInput) => {
    if (busy()) return { success: false, error: 'Wait for the current task to finish or cancel it first' };
    activeParse = new AbortController();
    try {
      const result = installTracks(await parseInput(rawInput, activeParse.signal));
      await persist();
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      activeParse = null;
    }
  });
  handle('fetch-metadata', (_, selectedIndices) => {
    if (busy()) return { success: false, error: 'Another task is already running' };
    if (!Array.isArray(selectedIndices) || !selectedIndices.every(Number.isSafeInteger)) return { success: false, error: 'Select valid tracks first' };
    const ids = new Set(selectedIndices);
    if (ids.size !== selectedIndices.length || ids.size > parsedTracks.length) return { success: false, error: 'Track selection is out of date' };
    if (parsedTracks.filter(track => ids.has(track.index)).length !== ids.size) return { success: false, error: 'Track selection is out of date' };
    const tracks = parsedTracks.filter(track => ids.has(track.index) && track.needsMetadata);
    if (!tracks.length) return { success: false, error: 'No selected tracks need details' };
    const job = { id: randomUUID(), controller: new AbortController(), next: 0, completed: 0, errors: 0, total: tracks.length, finished: false };
    activeMetadata = job;
    const worker = async () => {
      while (!job.controller.signal.aborted && job.next < tracks.length) {
        const track = tracks[job.next++];
        try {
          const details = await fetchTrackDetails(track, job.controller.signal);
          if (job.controller.signal.aborted) return;
          Object.assign(track, details, { metadataError: null });
        } catch (err) {
          if (job.controller.signal.aborted) return;
          track.metadataError = err.message;
          job.errors++;
        }
        job.completed++;
        send('metadata-progress', { jobId: job.id, track, completed: job.completed, total: job.total, errors: job.errors });
      }
    };
    const workers = tracks.every(track => track.source === 'soundcloud' && track.soundcloudId) ? 8 : 4;
    Promise.all(Array.from({ length: Math.min(workers, tracks.length) }, worker)).finally(() => {
      if (job.finished) return;
      job.finished = true;
      if (activeMetadata === job) activeMetadata = null;
      send('metadata-completed', { jobId: job.id, completed: job.completed, total: job.total, errors: job.errors, cancelled: job.controller.signal.aborted });
    });
    return { success: true, total: tracks.length, jobId: job.id };
  });
  handle('cancel-metadata', () => {
    if (!activeMetadata) return { success: false, error: 'No details lookup is running' };
    const job = activeMetadata;
    job.controller.abort();
    job.finished = true;
    activeMetadata = null;
    send('metadata-completed', { jobId: job.id, completed: job.completed, total: job.total, errors: job.errors, cancelled: true });
    return { success: true };
  });
  handle('find-matches', (_, request) => {
    if (busy()) return { success: false, error: 'Another task is already running' };
    const selectedIndices = Array.isArray(request) ? request : request?.indices;
    if (!Array.isArray(selectedIndices) || !selectedIndices.every(Number.isSafeInteger)) return { success: false, error: 'Select valid tracks first' };
    validSelection(selectedIndices, parsedTracks);
    const ids = new Set(selectedIndices);
    const force = request?.force === true;
    const tracks = parsedTracks.filter(track => ids.has(track.index) && (force || ((!track.directUrl || track.blockedOriginal) && !track.matchUrl)));
    if (!tracks.length) return { success: false, error: 'No selected tracks need matches' };
    for (const track of tracks) {
      if (force) track.blockedOriginal = true;
      if (track.blockedOriginal) track.autoFallbackTried = true;
      track.trimDecision = null; track.reviewSourcePath = null; track.inspection = null;
    }
    const job = { id: randomUUID(), controller: new AbortController(), next: 0, completed: 0, errors: 0, total: tracks.length, finished: false };
    activeMatching = job;
    const worker = async () => {
      while (!job.controller.signal.aborted && job.next < tracks.length) {
        const track = tracks[job.next++];
        try {
          const result = await findAudioMatches(track, job.controller.signal);
          if (job.controller.signal.aborted) return;
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
        send('match-progress', { jobId: job.id, track, completed: job.completed, total: job.total, errors: job.errors });
      }
    };
    const requestedConcurrency = Math.max(1, Math.min(12, Number(request?.concurrency) || 4));
    const workers = Math.min(tracks.length, 6, Math.max(1, Math.round(requestedConcurrency * 0.75)));
    Promise.all(Array.from({ length: workers }, worker)).finally(() => {
      if (job.finished) return;
      job.finished = true;
      if (activeMatching === job) activeMatching = null;
      send('match-completed', { jobId: job.id, completed: job.completed, total: job.total, errors: job.errors, cancelled: job.controller.signal.aborted });
    });
    return { success: true, total: tracks.length, workers, jobId: job.id };
  });
  handle('cancel-matches', () => {
    if (!activeMatching) return { success: false, error: 'No match search is running' };
    const job = activeMatching;
    job.controller.abort();
    job.finished = true;
    activeMatching = null;
    send('match-completed', { jobId: job.id, completed: job.completed, total: job.total, errors: job.errors, cancelled: true });
    return { success: true };
  });
  handle('choose-match', (_, index, url) => {
    if (busy()) return {success: false, error: 'Stop the current task first'};
    const track = parsedTracks.find(item => item.index === index);
    const candidate = track?.candidates?.find(item => item.url === url);
    if (!candidate) return { success: false, error: 'That match is no longer available' };
    if (!candidateVersionCompatible(track, candidate)) return { success: false, error: 'This recording conflicts with the requested version; choose another result' };
    track.matchUrl = url;
    track.matchState = 'chosen';
    track.matchError = null;
    track.trimDecision = null; track.reviewSourcePath = null; track.inspection = null;
    persist().catch(() => {});
    return { success: true, track };
  });
  handle('start-download', async (_, options) => {
    if (activeQueue) return { success: false, error: 'A batch is already running' };
    if (busy()) return { success: false, error: 'Wait for track review to finish' };
    if (!parsedTracks.length) return { success: false, error: 'Analyze a link or tracklist first' };
    let preferences;
    try { preferences = validatePreferences(options || {}); } catch (error) { return {success: false, error: error.message}; }
    if (!Array.isArray(options?.selectedIndices) || !options.selectedIndices.length || !options.selectedIndices.every(Number.isSafeInteger)) {
      return { success: false, error: 'Select at least one track' };
    }
    const selectedIds = new Set(options.selectedIndices);
    if (selectedIds.size !== options.selectedIndices.length) return { success: false, error: 'Track selection is out of date' };
    const selectedTracks = parsedTracks.filter(track => selectedIds.has(track.index));
    if (selectedTracks.length !== selectedIds.size) return { success: false, error: 'Track selection is out of date; reload the queue' };
    if (selectedTracks.some(track => track.needsMetadata)) return { success: false, error: 'Fetch details for selected tracks before downloading' };
    if (selectedTracks.some(track => track.matchUrl && track.candidates?.some(candidate => candidate.url === track.matchUrl && !candidateVersionCompatible(track, candidate)))) return { success: false, error: 'A selected recording conflicts with the requested version; review its match first' };
    if (selectedTracks.some(track => !track.localPath && (!track.directUrl || track.blockedOriginal) && !track.matchUrl)) return { success: false, error: 'Review audio matches for selected tracks before downloading' };
    if (sessionContext.collection?.incomplete && options.allowPartialPlaylist !== true) {
      return { success: false, error: 'This playlist is incomplete. Confirm that you want only the available tracks, or paste the full tracklist.' };
    }
    if (options.destinationDir !== selectedDestination || !selectedDestination || !fs.existsSync(selectedDestination)) {
      return { success: false, error: 'Choose a destination folder' };
    }
    let directory;
    try { directory = outputDirectory(selectedDestination, preferences.folderName, true); }
    catch (error) { return { success: false, error: error.message }; }
    sessionContext.folderName = preferences.folderName;
    const queue = new DownloadQueue({
      destinationDir: directory,
      cacheDir: path.join(app.getPath('userData'), 'audio-cache'),
      concurrency: options.concurrency,
      mode: options.mode,
      onTrackProgress: track => { const original = parsedTracks.find(item => item.id === track.id); if (original) Object.assign(original, track); send('track-progress', track); },
      onTrackCompleted: async track => {
        const original = parsedTracks.find(item => item.index === track.index);
        if (original) Object.assign(original, track);
        send('track-completed', track);
        await persist();
      },
      onLog: message => send('log', message),
      onAllCompleted: summary => {
        if (activeQueue === queue) activeQueue = null;
        send('batch-completed', summary);
        if (options.openFolderWhenFinished === true && !summary.cancelled && summary.destinationDir && (summary.completed || summary.skipped)) shell.openPath(summary.destinationDir);
      }
    });
    activeQueue = queue;
    queue.load(selectedTracks);
    queue.start();
    return { success: true };
  });
  handle('cancel-download', () => {
    if (!activeQueue) return { success: false, error: 'No active batch' };
    activeQueue.cancel();
    return { success: true };
  });
  handle('cancel-import', () => { activeParse?.abort(); return {success: true}; });
  handle('review-audio', async (_, id, decision) => {
    if (busy()) return {success: false, error: 'Wait for the current task first'};
    const track = parsedTracks.find(item => item.id === id);
    if (!track?.inspection || track.status !== 'audio_review') return {success: false, error: 'Audio review is no longer available'};
    if (!['keep', 'trim'].includes(decision?.action)) throw new Error('Invalid audio decision');
    if (decision.action === 'trim' && (!Number.isFinite(decision.endSec) || decision.endSec < 0.1 || decision.endSec > track.inspection.durationSec)) throw new Error('Endpoint is outside the recording');
    track.trimDecision = {action: decision.action, endSec: decision.action === 'trim' ? decision.endSec : null, sourceSha256: track.inspection.sourceSha256, approvedAt: new Date().toISOString(), analysisVersion: track.inspection.version};
    track.status = 'pending'; await persist(); return {success: true, track};
  });
  handle('export-diagnostics', async () => {
    const result = await dialog.showSaveDialog(owner(), {defaultPath: 'DeckPrep-diagnostics.json', filters: [{name: 'JSON', extensions: ['json']}]});
    if (result.canceled) return {success: false, cancelled: true};
    const data = {version: app.getVersion(), platform: process.platform, arch: process.arch, electron: process.versions.electron, engines: await engineVersions(),
      tracks: parsedTracks.map(track => ({id: track.id, source: track.source, status: track.status, errorCode: track.errorCode || null, hasInspection: !!track.inspection, needsReview: track.status === 'audio_review'}))};
    await fs.promises.writeFile(result.filePath, JSON.stringify(data, null, 2)); return {success: true};
  });
  handle('open-releases', async () => { await shell.openExternal('https://github.com/byohros6/DeckPrep/releases'); return {success: true}; });

}
