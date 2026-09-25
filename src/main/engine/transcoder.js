import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolveBinary } from './binaryManager.js';

const execFileAsync = promisify(execFile);

// Sanitize filename and remove duplicate/corrupt extensions
export function sanitizeExtension(filePath) {
  let cleaned = filePath;
  // Patterns like .mp3.mp3, .mp3.mpeg, .m4a.mp4, .mp3.webm, .mp3.part, etc.
  const doubleExtRegex = /\.(mp3|m4a|wav|aac|flac|ogg|opus)\.(mp3|mpeg|mp4|part|temp|ytdl|webm|opus)$/i;
  if (doubleExtRegex.test(cleaned)) {
    cleaned = cleaned.replace(/\.(mp3|mpeg|mp4|part|temp|ytdl|webm|opus)$/i, '');
  }
  return cleaned;
}

// Ensure safe filename without illegal characters on Windows (including control chars & trailing dots/spaces)
export function sanitizeFileName(name) {
  if (!name) return 'Untitled';
  let clean = name.replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/[\s.]+$/, '').trim();
  if (!clean) clean = 'Untitled';

  // Guard against Windows reserved device names
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (reserved.test(clean)) {
    clean = `_${clean}`;
  }
  return clean;
}

/**
 * Create a 320 kbps MP3 copy at 44.1 kHz stereo. Re-encoding cannot restore lost source quality.
 */
export async function transcodeToMp3(inputPath, outputPath, options = {}) {
  const ffmpegPath = await resolveBinary('ffmpeg');
  if (!ffmpegPath) throw new Error('FFmpeg binary is required for audio transcoding');

  const sampleRate = options.sampleRate || 44100; // 44.1 kHz (CDJ / Rekordbox standard)
  const bitrate = options.bitrate || '320k';      // Pristine 320 kbps CBR

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // FFmpeg command:
  // -y : overwrite
  // -i : input
  // -vn : strip video stream
  // -codec:a libmp3lame : LAME MP3 encoder
  // -b:a 320k : constant bitrate
  // -ar 44100 : standard sample rate
  // -ac 2 : stereo
  const args = [
    '-y',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vn',
    '-codec:a', 'libmp3lame',
    '-b:a', bitrate,
    '-ar', String(sampleRate),
    '-ac', '2',
    outputPath
  ];

  try {
    await execFileAsync(ffmpegPath, args, { signal: options.signal });
    return outputPath;
  } catch (err) {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    throw err;
  }
}
