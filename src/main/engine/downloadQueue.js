import { errorCode } from './errors.js';
import { releaseReviewAudio } from './reviewCache.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from './binaryManager.js';
import { resolveAudioCandidate } from './resolver.js';
import { transcodeToMp3 } from './transcoder.js';
import { tagMp3File } from './tagger.js';
import { buildDestinationPath } from './organizer.js';
import { normalizeTrack } from './sources.js';
import { cleanArtist, cleanTitle } from './metadata.js';
import { sanitizeFileName } from './transcoder.js';
import { randomUUID } from 'node:crypto';
import { inspectAudio } from './audioInspection.js';
import { readManifest, recordingIdentity, hashFile, writeManifest } from './exportManifest.js';

const execFileAsync = promisify(execFile);

export function downloadError(error) {
  if (/DRM protected/i.test(error.message)) return 'This source is protected and cannot be exported. Open it or find another recording.';
  if (/hls_mp3 format not found/i.test(error.message)) return 'This source has no audio format available for export. Open it or find another recording.';
  return error.message;
}

export function needsAlternative(error) {
  return /DRM protected|hls_mp3 format not found|no audio format available|only a short preview/i.test(error.message);
}

export async function verifyMp3File(filePath, options = {}) {
  const {version, durationSec, codec, peakDb, rmsDb} = await inspectAudio(filePath, {...options, requireMp3: true});
  return {version, durationSec, codec, peakDb, rmsDb};
}

export class DownloadQueue {
  constructor({ destinationDir, cacheDir = path.join(os.tmpdir(), 'deckprep-review'), concurrency = 4, mode = 'flat', onTrackProgress, onTrackCompleted, onLog, onAllCompleted }) {
    this.destinationDir = destinationDir;
    this.cacheDir = cacheDir;
    this.completion = new Promise(resolve => { this.resolveCompletion = resolve; });
    this.concurrency = Math.max(1, Math.min(Math.floor(Number(concurrency)) || 4, 12));
    this.mode = mode;
    this.onTrackProgress = onTrackProgress || (() => {});
    this.onTrackCompleted = onTrackCompleted || (() => {});
    this.onLog = onLog || (() => {});
    this.onAllCompleted = onAllCompleted || (() => {});
    this.tracks = [];
    this.nextIndex = 0;
    this.activeWorkers = 0;
    this.abortController = new AbortController();
    this.isCancelled = false;
    this.batchFinished = false;
    this.reservedPaths = new Set();
  }

  load(tracks) {
    this.tracks = tracks.map((track, index) => ({ ...track, id: track.id || randomUUID(), index: track.index || index + 1, status: 'pending', errorMessage: null }));
    this.nextIndex = 0;
    this.reservedPaths.clear();
  }

  start() {
    if (!this.tracks.length) return this.finishBatch();
    this.onLog(`Starting ${this.tracks.length} tracks with ${this.concurrency} workers.`);
    for (let i = 0; i < Math.min(this.concurrency, this.tracks.length); i++) this.spawnWorker();
  }

  cancel() {
    this.isCancelled = true;
    this.abortController.abort();
    this.onLog('Batch cancelled.');
    if (!this.activeWorkers) this.finishBatch();
  }

  spawnWorker() {
    if (this.isCancelled || this.nextIndex >= this.tracks.length) {
      if (this.activeWorkers === 0) this.finishBatch();
      return;
    }
    const track = this.tracks[this.nextIndex++];
    this.activeWorkers++;
    this.processTrack(track).catch(err => {
      track.status = this.isCancelled ? 'cancelled' : 'error';
      track.errorMessage = downloadError(err);
      track.errorCode = errorCode(err);
      if (!this.isCancelled && needsAlternative(err)) {
        track.blockedUrls = [...new Set([...(track.blockedUrls || []), track.matchUrl || track.directUrl].filter(Boolean))];
        track.blockedOriginal = true;
        track.matchUrl = null;
        track.matchState = 'needed';
      }
      if (!this.isCancelled) this.onLog(`Error: ${track.artist} - ${track.title}: ${track.errorMessage}`);
    }).finally(async () => {
      try { await this.onTrackCompleted(track); } catch (error) { this.onLog("Could not save completed track: " + error.message); }
      this.activeWorkers--;
      this.spawnWorker();
    });
  }

  destinationFor(track) {
    const base = buildDestinationPath({
      baseDir: this.destinationDir, mode: this.mode,
      artist: track.artist, title: track.title, mix: track.mix, genre: track.genre, ext: '.mp3'
    });
    const parsed = path.parse(base);
    const artist = sanitizeFileName(track.artist || 'Unknown Artist').slice(0, 40).trim();
    for (let number = 0; number < 100; number++) {
      const suffix = number === 0 ? '' : number === 1 ? ` (${artist})` : ` (${artist} ${number})`;
      const outputPath = path.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`);
      const key = outputPath.toLowerCase();
      if (this.reservedPaths.has(key)) continue;
      if (fs.existsSync(outputPath)) {
        const manifest = readManifest(outputPath);
        if (!manifest || manifest.identity !== recordingIdentity(track)) continue;
        this.reservedPaths.add(key);
        return { outputPath, exists: true };
      }
      this.reservedPaths.add(key);
      return { outputPath, exists: false };
    }
    throw new Error('Too many files with this song title in the destination folder');
  }

  async processTrack(track) {
    let candidate;
    const signal = this.abortController.signal;
    track.requested ||= {title: track.title, artist: track.artist, mix: track.mix || '', durationSec: track.durationSec || 0};
    if (track.needsMetadata) {
      track.status = 'resolving';
      this.onTrackProgress(track);
      candidate = await resolveAudioCandidate({
        artist: track.artist, title: track.title, mix: track.mix,
        targetDurationSec: 0, directUrl: track.matchUrl || track.directUrl, strictDirect: true,
        signal: this.abortController.signal
      });
      if (this.isCancelled) { track.status = 'cancelled'; return; }
      if (!candidate.directMatch || !candidate.metadata?.title) throw new Error('Could not read track metadata from this link');
      const metadata = normalizeTrack(candidate.metadata, track.source, track.directUrl);
      if (!metadata.album) metadata.album = track.album;
      Object.assign(track, metadata);
      this.onTrackProgress(track);
    }
    if (track.source === 'soundcloud' && track.durationSec > 0 && track.durationSec <= 35 && this.mode !== 'sampler') {
      throw new Error('SoundCloud supplied only a short preview for this track');
    }
    if (!track.localPath && this.mode === 'genre' && !track.genre) {
      track.status = 'resolving';
      this.onTrackProgress(track);
      candidate ||= await resolveAudioCandidate({
        artist: track.artist, title: track.title, mix: track.mix,
        targetDurationSec: track.matchUrl && track.matchState !== 'chosen' ? track.durationSec : 0,
        directUrl: track.matchUrl || track.directUrl, strictDirect: true,
        signal: this.abortController.signal
      });
      if (this.isCancelled) { track.status = 'cancelled'; return; }
      track.genre = candidate.metadata?.genre || '';
    }
    if (track.localPath) track.sourceSha256 = await hashFile(track.localPath, signal);
    const { outputPath, exists } = this.destinationFor(track);
    track.outputPath = outputPath;
    if (exists) {
      const manifest = readManifest(outputPath);
      if (manifest.sha256 !== await hashFile(outputPath, signal)) throw new Error('Existing output changed since verification; existing file kept');
      track.verification = await verifyMp3File(outputPath, {signal, expectedDurationSec: manifest.verification?.durationSec});
      track.status = 'skipped';
      this.onLog(`Skipped existing output: ${path.basename(outputPath)}`);
      return;
    }
    track.status = 'resolving';
    this.onTrackProgress(track);
    candidate ||= track.reviewSourcePath && fs.existsSync(track.reviewSourcePath) ? {selectedUrl: track.selectedRecording?.url || track.directUrl, durationSec: track.inspection?.durationSec || 0, metadata: {}} : track.localPath ? {selectedUrl: track.localPath, durationSec: 0, metadata: {}} : await resolveAudioCandidate({
      artist: track.artist, title: track.title, mix: track.mix,
      targetDurationSec: track.matchUrl && track.matchState !== 'chosen' ? track.durationSec : 0,
      directUrl: track.matchUrl || track.directUrl, strictDirect: true,
      signal: this.abortController.signal
    });
    if (this.isCancelled) { track.status = 'cancelled'; return; }
    if (/^https:\/\/(?:[^/]+\.)?soundcloud\.com\//i.test(candidate.selectedUrl)
      && candidate.durationSec > 0 && candidate.durationSec <= 35 && this.mode !== 'sampler') {
      throw new Error('This SoundCloud link supplies only a short preview');
    }
    track.selectedRecording = {...(track.selectedRecording || {}), url: candidate.selectedUrl,
      method: track.localPath ? 'local' : track.matchState === 'chosen' ? 'manual' : track.matchUrl ? 'automatic' : 'original',
      title: candidate.metadata?.title || track.title, durationSec: candidate.durationSec || 0,
      originalUrl: track.directUrl || track.sourceUrl || null};
    fs.mkdirSync(this.cacheDir, {recursive: true});
    const tempDir = fs.mkdtempSync(path.join(this.cacheDir, 'audio-'));
    const template = path.join(tempDir, 'source.%(ext)s');
    const partialOutput = outputPath + '.' + process.pid + '.' + track.index + '.partial.mp3';
    let preserveReview = false;
    let sourcePath = track.localPath || track.reviewSourcePath;
    try {
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        track.status = 'downloading'; this.onTrackProgress(track);
        const binary = await resolveBinary('yt-dlp');
        await execFileAsync(binary, ['--no-playlist', '--no-progress', '--quiet', '--socket-timeout', '20', '--retries', '2', '--format', 'bestaudio/best', '--output', template, '--', candidate.selectedUrl], {
          signal, timeout: 300000, windowsHide: true
        });
        const sourceName = fs.readdirSync(tempDir).find(name => name.startsWith('source.') && !name.endsWith('.part'));
        if (!sourceName) throw new Error('Downloaded audio file was not found');
        sourcePath = path.join(tempDir, sourceName);
      }
      signal.throwIfAborted();
      track.status = 'inspecting'; this.onTrackProgress(track);
      const sourceSha256 = await hashFile(sourcePath, signal);
      if (track.trimDecision?.sourceSha256 && track.trimDecision.sourceSha256 !== sourceSha256) track.trimDecision = null;
      track.inspection = {...await inspectAudio(sourcePath, {signal, expectedDurationSec: candidate.durationSec}), sourceSha256};
      if (track.localPath) track.durationSec = track.inspection.durationSec;
      if (track.inspection.ending && !track.trimDecision) {
        track.reviewSourcePath = sourcePath;
        track.status = 'audio_review'; preserveReview = sourcePath.startsWith(tempDir + path.sep);
        this.onLog('Review possible silent ending: ' + track.title);
        return;
      }
      const endSec = track.trimDecision?.action === 'trim' ? track.trimDecision.endSec : undefined;
      if (endSec !== undefined && (!Number.isFinite(endSec) || endSec < 0.1 || endSec > track.inspection.durationSec)) throw new Error('Trim endpoint is outside the recording');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      track.status = 'transcoding';
      this.onTrackProgress(track);
      if (track.localPath && track.inspection.codec.startsWith('mp3') && !endSec) await fs.promises.copyFile(sourcePath, partialOutput);
      else await transcodeToMp3(sourcePath, partialOutput, {signal, endSec});
      if (this.isCancelled) { track.status = 'cancelled'; return; }
      track.status = 'tagging';
      this.onTrackProgress(track);
      await tagMp3File(partialOutput, track, {signal});
      if (this.isCancelled) { track.status = 'cancelled'; return; }
      track.verification = await verifyMp3File(partialOutput, {signal, expectedDurationSec: endSec || track.inspection.durationSec});
      if (fs.existsSync(outputPath)) throw new Error('Output appeared during processing; existing file kept');
      // Exclusive creation also protects against another app writing between check and commit.
      await fs.promises.copyFile(partialOutput, outputPath, fs.constants.COPYFILE_EXCL);
      await writeManifest(outputPath, track, track.verification);
      if (!track.localPath && track.reviewSourcePath) {
        try { await releaseReviewAudio(track.reviewSourcePath, this.cacheDir); track.reviewSourcePath = null; }
        catch { this.onLog('Export verified; retained review audio could not be removed'); }
      }
      track.status = 'done';
      this.onLog(`Ready: ${path.basename(outputPath)}`);
    } finally {
      if (fs.existsSync(partialOutput)) fs.unlinkSync(partialOutput);
      if (!preserveReview) fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  finishBatch() {
    if (this.batchFinished) return;
    this.batchFinished = true;
    const summary = {
      total: this.tracks.length,
      completed: this.tracks.filter(track => track.status === 'done').length,
      skipped: this.tracks.filter(track => track.status === 'skipped').length,
      review: this.tracks.filter(track => track.status === 'audio_review').length,
      errors: this.tracks.filter(track => track.status === 'error').length,
      cancelled: this.isCancelled,
      destinationDir: this.destinationDir
    };
    try { this.onAllCompleted(summary); } finally { this.resolveCompletion(summary); }
  }
}
