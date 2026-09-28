import NodeID3 from 'node-id3';
import { cleanArtist, versionedTitle } from './metadata.js';
import { resolveBinary } from './binaryManager.js';
import { spawn } from 'child_process';
import { readLocalMetadata } from './localImport.js';

/**
 * Ensures artwork buffer is formatted as baseline JPEG for strict Pioneer CDJ / Rekordbox hardware compatibility
 */
async function ensureJpegBuffer(buffer, signal) {
  if (!buffer || buffer.length < 4) return null;
  // Convert WebP / PNG / AVIF to JPEG via FFmpeg
  try {
    const ffmpegPath = await resolveBinary('ffmpeg');
    if (!ffmpegPath) {
      return null;
    }

    return await new Promise((resolve) => {
      const proc = spawn(ffmpegPath, [
        '-y',
        '-i', 'pipe:0',
        '-vframes', '1', '-vf', 'scale=600:600:force_original_aspect_ratio=decrease',
        '-f', 'image2',
        '-c:v', 'mjpeg',
        'pipe:1'
      ], { signal, windowsHide: true, timeout: 10000 });
      proc.stderr.resume();

      const chunks = [];
      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          resolve({ buffer: Buffer.concat(chunks), mime: 'image/jpeg' });
        } else {
          resolve(null);
        }
      });
      proc.on('error', () => {
        resolve(null);
      });

      proc.stdin.on('error', () => {});
      proc.stdin.write(buffer);
      proc.stdin.end();
    });
  } catch {
    return null;
  }
}

/**
 * Embed ID3v2.3 tags into MP3 files tailored for Pioneer Rekordbox / CDJ compatibility
 */
export async function tagMp3File(filePath, metadata, {signal} = {}) {
  const title = versionedTitle(metadata);
  const artist = cleanArtist(metadata.artist || '');
  const album = metadata.album || '';
  const genre = metadata.genre || '';
  const year = metadata.year ? String(metadata.year) : '';

  const tags = {
    title,
    artist,
    genre,
    year,
    comment: { language: 'eng', text: 'Prepared with DeckPrep' }
  };
  if (album) tags.album = album;

  // Embed BPM for Rekordbox / CDJ hardware grid display
  if (metadata.bpm && Number(metadata.bpm) > 0) {
    tags.bpm = String(Math.round(Number(metadata.bpm)));
  }

  // Use existing embedded art or artwork supplied with source metadata.
  let rawImageBuffer = metadata.imageBuffer;
  if (!rawImageBuffer && metadata.localPath) {
    try {
      const original = await readLocalMetadata(metadata.localPath, signal, false);
      const picture = original.common.picture?.[0]?.data;
      if (picture && picture.length < 8 * 1024 * 1024) rawImageBuffer = Buffer.from(picture);
    } catch { metadata.artworkWarning = 'Original artwork could not be read'; }
  }
  if (!rawImageBuffer && metadata.artworkUrl) {
    try {
      const artworkUrl = new URL(metadata.artworkUrl);
      if (artworkUrl.protocol === 'https:') {
        const response = await fetch(artworkUrl, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
        if (response.ok && Number(response.headers.get('content-length') || 0) < 8 * 1024 * 1024) {
          const chunks = []; let length = 0;
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length >= 8 * 1024 * 1024) throw new Error('Artwork is too large');
            chunks.push(chunk);
          }
          rawImageBuffer = Buffer.concat(chunks);
        }
      }
    } catch { metadata.artworkWarning = 'Artwork could not be loaded and was omitted'; }
  }

  if (rawImageBuffer) {
    const jpegResult = await ensureJpegBuffer(rawImageBuffer, signal);
    if (!jpegResult) metadata.artworkWarning = 'Artwork could not be normalized and was omitted';
    if (jpegResult) {
      tags.image = {
        mime: jpegResult.mime,
        type: {
          id: 3,
          name: 'front cover'
        },
        description: 'Cover Art',
        imageBuffer: jpegResult.buffer
      };
    }
  }

  signal?.throwIfAborted();
  // Write ID3v2.3 tags synchronously / promise-wrapped
  return new Promise((resolve, reject) => {
    NodeID3.write(tags, filePath, (err) => {
      if (err) {
        return reject(err);
      }
      resolve({ success: true, tags });
    });
  });
}
