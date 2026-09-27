import path from 'path';
import { sanitizeFileName } from './transcoder.js';

/**
 * Computes destination file paths according to DJ crate organization modes
 */
export function buildDestinationPath({
  baseDir,
  mode = 'flat', // 'flat' | 'artist' | 'genre' | legacy 'partitioned' | 'sampler'
  artist,
  title,
  mix,
  genre,
  ext = '.mp3'
}) {
  let cleanA = sanitizeFileName(artist || 'Unknown Artist');
  if (cleanA.length > 60) cleanA = cleanA.substring(0, 60).trim();

  let cleanT = sanitizeFileName(title || 'Untitled').replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|aiff)$/i, '');
  if (cleanT.length > 80) cleanT = cleanT.substring(0, 80).trim();

  if (mix && !cleanT.toLowerCase().includes(mix.toLowerCase())) {
    const cleanMix = sanitizeFileName(mix);
    const shortMix = cleanMix.length > 40 ? cleanMix.substring(0, 40).trim() : cleanMix;
    cleanT += ` (${shortMix})`;
  }

  // Clean trailing dots and spaces from cleanT before appending extension
  cleanT = cleanT.replace(/[\s.]+$/, '');

  const fileName = `${cleanT}${ext}`;

  if (mode === 'sampler') {
    return path.join(baseDir, 'DJ Sampler Bank', fileName);
  }

  if (mode === 'artist') return path.join(baseDir, cleanA, fileName);
  if (mode === 'genre') return path.join(baseDir, sanitizeFileName(genre?.trim() || 'Unknown Genre'), fileName);
  if (mode === 'partitioned') return path.join(baseDir, sanitizeFileName(genre?.trim() || cleanA), fileName);

  // Default: Consolidated Flat Master
  return path.join(baseDir, fileName);
}
