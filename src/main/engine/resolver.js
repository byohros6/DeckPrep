import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from './binaryManager.js';
import { cleanArtist, cleanTitle } from './metadata.js';

const execFileAsync = promisify(execFile);

export function buildSearchQuery(artist, title, mix) {
  const cleanedTitle = cleanTitle(title);
  const suffix = mix && !cleanedTitle.toLowerCase().includes(mix.toLowerCase()) ? ` ${mix}` : '';
  return `${cleanArtist(artist)} - ${cleanedTitle}${suffix}`;
}

function readJsonLines(stdout) {
  return stdout.split(/\r?\n/).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export async function resolveAudioCandidate({ artist, title, mix, targetDurationSec, directUrl, strictDirect = false, signal }) {
  const binary = await resolveBinary('yt-dlp');
  if (!binary) throw new Error('yt-dlp engine is missing');
  if (directUrl) {
    try {
      const { stdout } = await execFileAsync(binary, ['--dump-json', '--no-playlist', '--', directUrl], {
        maxBuffer: 10 * 1024 * 1024, signal
      });
      const item = readJsonLines(stdout)[0];
      if (item && (!targetDurationSec || !item.duration || Math.abs(item.duration - targetDurationSec) <= 10)) {
        return { selectedUrl: directUrl, durationSec: item.duration || 0, directMatch: true, metadata: item };
      }
      if (strictDirect) throw new Error('The selected recording has a different duration. Review its match.');
    } catch (err) {
      if (signal?.aborted) throw err;
      if (strictDirect) throw err;
    }
  }
  if (strictDirect) throw new Error('This recording has no source link');
  const query = buildSearchQuery(artist, title, mix);
  const { stdout } = await execFileAsync(binary, ['--dump-json', '--flat-playlist', '--', `ytsearch5:${query}`], {
    maxBuffer: 15 * 1024 * 1024, signal
  });
  const candidates = readJsonLines(stdout).map(item => ({
    url: item.webpage_url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : item.url),
    duration: Number(item.duration) || 0
  })).filter(item => item.url);
  if (!candidates.length) throw new Error(`No audio candidates found for ${query}`);
  if (!targetDurationSec) return { selectedUrl: candidates[0].url, durationSec: candidates[0].duration };
  const withDuration = candidates.filter(item => item.duration > 0)
    .sort((a, b) => Math.abs(a.duration - targetDurationSec) - Math.abs(b.duration - targetDurationSec));
  const best = withDuration[0];
  if (!best || Math.abs(best.duration - targetDurationSec) > 10) {
    throw new Error(`No candidate was within 10 seconds of the requested version (${query})`);
  }
  return { selectedUrl: best.url, durationSec: best.duration };
}
