import NodeID3 from 'node-id3';
import { cleanTitle, cleanArtist } from './metadata.js';
import { resolveBinary } from './binaryManager.js';
import { spawn } from 'child_process';

/**
 * Ensures artwork buffer is formatted as baseline JPEG for strict Pioneer CDJ / Rekordbox hardware compatibility
 */
async function ensureJpegBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;
  // If already standard JPEG (FF D8 FF)
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    return { buffer, mime: 'image/jpeg' };
  }

  // Convert WebP / PNG / AVIF to JPEG via FFmpeg
  try {
    const ffmpegPath = await resolveBinary('ffmpeg');
    if (!ffmpegPath) {
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
      return { buffer, mime: isPng ? 'image/png' : 'image/jpeg' };
    }

    return await new Promise((resolve) => {
      const proc = spawn(ffmpegPath, [
        '-y',
        '-i', 'pipe:0',
        '-vframes', '1',
        '-f', 'image2',
        '-c:v', 'mjpeg',
        'pipe:1'
      ]);

      const chunks = [];
      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          resolve({ buffer: Buffer.concat(chunks), mime: 'image/jpeg' });
        } else {
          const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
          resolve({ buffer, mime: isPng ? 'image/png' : 'image/jpeg' });
        }
      });
      proc.on('error', () => {
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
        resolve({ buffer, mime: isPng ? 'image/png' : 'image/jpeg' });
      });

      proc.stdin.on('error', () => {});
      proc.stdin.write(buffer);
      proc.stdin.end();
    });
  } catch {
    return { buffer, mime: 'image/jpeg' };
  }
}

/**
 * Embed ID3v2.3 tags into MP3 files tailored for Pioneer Rekordbox / CDJ compatibility
 */
export async function tagMp3File(filePath, metadata) {
  const title = cleanTitle(metadata.title || '');
  const artist = cleanArtist(metadata.artist || '');
  const album = metadata.album || title;
  const genre = metadata.genre || 'Electronic / Dance';
  const year = metadata.year ? String(metadata.year) : '';

  const tags = {
    title,
    artist,
    album,
    genre,
    year,
    comment: { language: 'eng', text: 'Prepared with DeckPrep' }
  };

  // Embed BPM for Rekordbox / CDJ hardware grid display
  if (metadata.bpm && Number(metadata.bpm) > 0) {
    tags.bpm = String(Math.round(Number(metadata.bpm)));
  }

  // Use existing embedded art or artwork supplied with source metadata.
  let rawImageBuffer = metadata.imageBuffer;
  if (!rawImageBuffer && metadata.artworkUrl) {
    try {
      const artworkUrl = new URL(metadata.artworkUrl);
      if (artworkUrl.protocol === 'https:') {
        const response = await fetch(artworkUrl, { signal: AbortSignal.timeout(10000) });
        if (response.ok && Number(response.headers.get('content-length') || 0) < 8 * 1024 * 1024) {
          const data = Buffer.from(await response.arrayBuffer());
          if (data.length < 8 * 1024 * 1024) rawImageBuffer = data;
        }
      }
    } catch {}
  }

  if (rawImageBuffer) {
    const jpegResult = await ensureJpegBuffer(rawImageBuffer);
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
