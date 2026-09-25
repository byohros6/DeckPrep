import path from 'path';
import { sanitizeFileName } from './transcoder.js';

/**
 * Computes destination file paths according to DJ crate organization modes
 */
export function buildDestinationPath({
  baseDir,
  mode = 'flat', // 'flat' | 'partitioned' | 'sampler'
  index,
  artist,
  title,
  mix,
  genre,
  ext = '.mp3'
}) {
  const padIndex = String(index).padStart(3, '0');
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

  // Standard collision-free naming: "001. Artist - Title (Mix).mp3"
  const fileName = `${padIndex}. ${cleanA} - ${cleanT}${ext}`;

  if (mode === 'sampler') {
    return path.join(baseDir, 'DJ Sampler Bank', fileName);
  }

  if (mode === 'partitioned') {
    // Group either by genre or artist subfolder
    const rawFolder = (genre && genre.trim()) ? genre.trim() : cleanA;
    const subfolder = sanitizeFileName(rawFolder);
    return path.join(baseDir, subfolder, fileName);
  }

  // Default: Consolidated Flat Master
  return path.join(baseDir, fileName);
}
