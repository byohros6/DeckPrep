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
import NodeID3 from 'node-id3';

const execFileAsync = promisify(execFile);

export function downloadError(error) {
  if (/DRM protected/i.test(error.message)) return 'This source is protected and cannot be exported. Open it or find another recording.';
  if (/hls_mp3 format not found/i.test(error.message)) return 'This source has no audio format available for export. Open it or find another recording.';
  return error.message;
}

export function verifyMp3File(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size < 8 * 1024) throw new Error('Output is too small to be a complete MP3');
  const descriptor = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(3);
  try { fs.readSync(descriptor, header, 0, 3, 0); } finally { fs.closeSync(descriptor); }
  if (header.toString('ascii') !== 'ID3' && !(header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) {
    throw new Error('Output is not a valid MP3 file');
  }
}

export class DownloadQueue {
  constructor({ destinationDir, concurrency = 4, mode = 'flat', onTrackProgress, onTrackCompleted, onLog, onAllCompleted }) {
    this.destinationDir = destinationDir;
    this.concurrency = Math.max(1, Math.min(Number(concurrency) || 4, 32));
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
    this.tracks = tracks.map((track, index) => ({ ...track, index: track.index || index + 1, status: 'pending', errorMessage: null }));
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
      if (!this.isCancelled) this.onLog(`Error: ${track.artist} - ${track.title}: ${track.errorMessage}`);
    }).finally(() => {
      this.activeWorkers--;
      this.onTrackCompleted(track);
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
        try { verifyMp3File(outputPath); }
        catch { throw new Error(`An output file already exists but appears incomplete: ${path.basename(outputPath)}`); }
        const tags = NodeID3.read(outputPath);
        const sameTitle = cleanTitle(tags.title).toLowerCase() === cleanTitle(track.title).toLowerCase();
        const sameArtist = cleanArtist(tags.artist).toLowerCase() === cleanArtist(track.artist).toLowerCase();
        if (!sameTitle || !sameArtist) continue;
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
    if (this.mode === 'genre' && !track.genre) {
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
    const { outputPath, exists } = this.destinationFor(track);
    track.outputPath = outputPath;
    if (exists) {
      track.status = 'skipped';
      this.onLog(`Skipped existing output: ${path.basename(outputPath)}`);
      return;
    }
    track.status = 'resolving';
    this.onTrackProgress(track);
    candidate ||= await resolveAudioCandidate({
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckprep-'));
    const template = path.join(tempDir, 'source.%(ext)s');
    const partialOutput = `${outputPath}.${process.pid}.${track.index}.partial.mp3`;
    try {
      track.status = 'downloading';
      this.onTrackProgress(track);
      const binary = await resolveBinary('yt-dlp');
      await execFileAsync(binary, ['--no-playlist', '--no-progress', '--quiet', '--format', 'bestaudio/best', '--output', template, '--', candidate.selectedUrl], {
        signal: this.abortController.signal
      });
      if (this.isCancelled) { track.status = 'cancelled'; return; }
      const sourceName = fs.readdirSync(tempDir).find(name => name.startsWith('source.') && !name.endsWith('.part'));
      if (!sourceName) throw new Error('Downloaded audio file was not found');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      track.status = 'transcoding';
      this.onTrackProgress(track);
      await transcodeToMp3(path.join(tempDir, sourceName), partialOutput, { signal: this.abortController.signal });
      if (this.isCancelled) { track.status = 'cancelled'; return; }
      track.status = 'tagging';
      this.onTrackProgress(track);
      await tagMp3File(partialOutput, track);
      if (this.isCancelled) { track.status = 'cancelled'; return; }
      verifyMp3File(partialOutput);
      if (fs.existsSync(outputPath)) throw new Error('Output appeared during processing; existing file kept');
      fs.renameSync(partialOutput, outputPath);
      track.status = 'done';
      this.onLog(`Ready: ${path.basename(outputPath)}`);
    } finally {
      if (fs.existsSync(partialOutput)) fs.unlinkSync(partialOutput);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  finishBatch() {
    if (this.batchFinished) return;
    this.batchFinished = true;
    this.onAllCompleted({
      total: this.tracks.length,
      completed: this.tracks.filter(track => track.status === 'done').length,
      skipped: this.tracks.filter(track => track.status === 'skipped').length,
      errors: this.tracks.filter(track => track.status === 'error').length,
      cancelled: this.isCancelled,
      destinationDir: this.destinationDir
    });
  }
}
