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

const execFileAsync = promisify(execFile);

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
  }

  load(tracks) {
    this.tracks = tracks.map((track, index) => ({ ...track, index: track.index || index + 1, status: 'pending' }));
    this.nextIndex = 0;
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
      track.errorMessage = err.message;
      if (!this.isCancelled) this.onLog(`Error: ${track.artist} - ${track.title}: ${err.message}`);
    }).finally(() => {
      this.activeWorkers--;
      this.onTrackCompleted(track);
      this.spawnWorker();
    });
  }

  async processTrack(track) {
    let candidate;
    if (track.needsMetadata) {
      track.status = 'resolving';
      this.onTrackProgress(track);
      candidate = await resolveAudioCandidate({
        artist: track.artist, title: track.title, mix: track.mix,
        targetDurationSec: 0, directUrl: track.directUrl,
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
    const outputPath = buildDestinationPath({
      baseDir: this.destinationDir, mode: this.mode, index: track.index,
      artist: track.artist, title: track.title, mix: track.mix, genre: track.genre, ext: '.mp3'
    });
    track.outputPath = outputPath;
    if (fs.existsSync(outputPath)) {
      if (fs.statSync(outputPath).size <= 100 * 1024) {
        throw new Error('An output file already exists but appears incomplete; it was not overwritten');
      }
      track.status = 'skipped';
      this.onLog(`Skipped existing output: ${path.basename(outputPath)}`);
      return;
    }
    track.status = 'resolving';
    this.onTrackProgress(track);
    candidate ||= await resolveAudioCandidate({
      artist: track.artist, title: track.title, mix: track.mix,
      targetDurationSec: track.durationSec, directUrl: track.directUrl,
      signal: this.abortController.signal
    });
    if (this.isCancelled) { track.status = 'cancelled'; return; }
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
