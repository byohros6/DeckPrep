import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { parseStream } from 'music-metadata';
import { parseTracklistLine } from './parser.js';
const extensions = new Set(['.mp3', '.wav', '.flac', '.aiff', '.aif', '.m4a']);

export async function readLocalMetadata(file, signal, skipCovers = true) {
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  const stream = createReadStream(file, {signal: bounded});
  try { return await parseStream(stream, {path: file, size: (await fs.stat(file)).size}, {skipCovers, duration: false}); }
  finally { stream.destroy(); }
}

export async function importLocal(paths, signal) {
  const files = [], warnings = [];
  async function visit(file, depth = 0) {
    signal?.throwIfAborted();
    if (files.length >= 10000) throw new Error('Local import is limited to 10,000 files');
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      if (depth > 20) { warnings.push('A deeply nested folder was skipped'); return; }
      for (const name of (await fs.readdir(file)).sort()) await visit(path.join(file, name), depth + 1);
    } else if (stat.isFile() && extensions.has(path.extname(file).toLowerCase())) files.push(file);
  }
  for (const file of paths) await visit(file);
  const tracks = [];
  for (const file of new Set(files)) {
    signal?.throwIfAborted();
    const parsed = parseTracklistLine(path.basename(file, path.extname(file)));
    let tags = {}, format = {};
    try { const metadata = await readLocalMetadata(file, signal); tags = metadata.common; format = metadata.format; }
    catch (error) { if (signal?.aborted) throw error; warnings.push(`Metadata could not be read for ${path.basename(file)}; audio will be checked before export`); }
    tracks.push({...parsed, title: tags.title || parsed.title, mix: parseTracklistLine(tags.title || parsed.title)?.mix || parsed.mix,
      artist: tags.artist || parsed.artist, album: tags.album || '', genre: tags.genre?.join(', ') || '', year: tags.year || null, bpm: tags.bpm || null,
      source: 'local', localPath: file, needsMetadata: false, durationSec: format.duration || 0, sourceCodec: format.codec || null});
  }
  if (!tracks.length) throw new Error('No supported audio files found');
  return {source: 'local', title: 'Local audio', tracks, warning: warnings.join('. ')};
}
