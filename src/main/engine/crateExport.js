import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashFile, readManifest } from './exportManifest.js';
import { inspectAudio } from './audioInspection.js';
import { sanitizeFileName } from './transcoder.js';

export async function exportCrate(tracks, directory, title = 'DeckPrep crate', signal) {
  const included = [], excluded = [];
  for (const track of tracks) {
    signal?.throwIfAborted();
    try {
      if (!['done', 'skipped'].includes(track.status) || !track.outputPath) throw new Error('Not verified or awaiting review');
      const relative = path.relative(directory, track.outputPath);
      if (relative.startsWith('..') || path.isAbsolute(relative) || /[\r\n]/.test(relative)) throw new Error('File is outside this crate destination');
      const manifest = readManifest(track.outputPath);
      if (!manifest || manifest.sha256 !== await hashFile(track.outputPath, signal)) throw new Error('File changed since export');
      const verification = await inspectAudio(track.outputPath, {signal, requireMp3: true, expectedDurationSec: manifest.verification?.durationSec});
      included.push({id: track.id, title: manifest.title, artist: manifest.artist, relativePath: relative.replaceAll('\\', '/'), durationSec: verification.durationSec,
        selectedRecording: manifest.selectedRecording, trimDecision: manifest.trimDecision, sha256: manifest.sha256});
    } catch (error) {
      if (signal?.aborted) throw error;
      excluded.push({id: track.id, title: track.title, reason: error.message});
    }
  }
  if (!included.length) throw new Error('No verified audio is available to export');
  const name = sanitizeFileName(title).slice(0, 80) + '-' + randomUUID().slice(0, 8);
  const playlist = path.join(directory, name + '.m3u8');
  const clean = value => String(value || '').replace(/[\r\n]/g, ' ');
  const body = '#EXTM3U\n' + included.map(track => `#EXTINF:${Math.round(track.durationSec)},${clean(track.artist)} - ${clean(track.title)}\n./${track.relativePath}`).join('\n') + '\n';
  await fs.writeFile(playlist, body, {flag: 'wx'});
  await fs.writeFile(path.join(directory, name + '.json'), JSON.stringify({version: 1, createdAt: new Date().toISOString(), included, excluded}, null, 2), {flag: 'wx'});
  return {playlist, included: included.length, excluded};
}
