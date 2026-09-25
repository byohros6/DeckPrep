import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from './binaryManager.js';
import { buildSearchQuery } from './resolver.js';
import { parseTracklistLine } from './parser.js';

const execFileAsync = promisify(execFile);

function words(value) {
  return new Set(String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(official|audio|video|lyrics|visualizer|hd|hq)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean));
}

function overlap(a, b) {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  return [...left].filter(token => right.has(token)).length / Math.max(left.size, right.size);
}

export function scoreCandidate(track, candidate) {
  const parsed = parseTracklistLine(candidate.title || '');
  const candidateTitle = parsed?.artist !== 'Unknown Artist' ? parsed.title : candidate.title;
  const candidateArtist = candidate.artist || candidate.uploader || (parsed?.artist !== 'Unknown Artist' ? parsed.artist : '');
  const titleScore = Math.max(overlap(track.title, candidateTitle), overlap(track.title, candidate.title));
  const artistScore = overlap(track.artist, candidateArtist) || overlap(track.artist, candidate.title);
  let score = titleScore * 0.56 + artistScore * 0.25;
  if (track.mix) score += overlap(track.mix, candidate.title) * 0.1 - (overlap(track.mix, candidate.title) < 0.35 ? 0.12 : 0);
  if (track.durationSec > 0 && candidate.durationSec > 0) {
    const difference = Math.abs(track.durationSec - candidate.durationSec);
    score += difference <= 4 ? 0.19 : difference <= 10 ? 0.12 : difference <= 20 ? 0 : -0.3;
  }
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

export function rankCandidates(track, candidates) {
  const unique = new Map();
  for (const candidate of candidates) {
    if (candidate.url && !unique.has(candidate.url)) unique.set(candidate.url, { ...candidate, score: scoreCandidate(track, candidate) });
  }
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  const first = ranked[0];
  const second = ranked[1];
  const durationKnown = track.durationSec > 0 && first?.durationSec > 0;
  const confident = !!first && first.score >= 0.78 && (!second || first.score - second.score >= 0.12)
    && durationKnown && Math.abs(first.durationSec - track.durationSec) <= 10;
  return { candidates: ranked, chosen: confident ? first : null };
}

async function search(binary, prefix, query, signal) {
  const { stdout } = await execFileAsync(binary, ['--dump-json', '--flat-playlist', '--', `${prefix}:${query}`], {
    maxBuffer: 8 * 1024 * 1024, signal, timeout: 30000
  });
  return stdout.split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      const item = JSON.parse(line);
      const url = item.webpage_url || (item.id && prefix.startsWith('yt') ? `https://www.youtube.com/watch?v=${item.id}` : item.url);
      if (!url?.startsWith('https://')) return [];
      return [{ url, title: item.title || '', artist: item.artist || item.uploader || '',
        durationSec: Math.round(item.duration || 0), provider: prefix.startsWith('sc') ? 'SoundCloud' : 'YouTube' }];
    } catch { return []; }
  });
}

export async function findAudioMatches(track, signal) {
  const binary = await resolveBinary('yt-dlp');
  if (!binary) throw new Error('Search engine is missing');
  const query = buildSearchQuery(track.artist, track.title, track.mix);
  const results = await Promise.allSettled([
    search(binary, 'ytsearch5', query, signal),
    search(binary, 'scsearch5', query, signal)
  ]);
  if (signal?.aborted) throw signal.reason || new Error('Stopped');
  const candidates = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!candidates.length) throw new Error('No matching audio found on YouTube or SoundCloud');
  return rankCandidates(track, candidates);
}
