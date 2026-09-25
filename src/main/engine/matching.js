import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from './binaryManager.js';
import { buildSearchQuery } from './resolver.js';
import { parseTracklistLine } from './parser.js';

const execFileAsync = promisify(execFile);
const NOISE = /\b(official|audio|video|visualizer|visualiser|lyrics?|music|hd|hq|4k|feat|featuring|ft)\b/g;

function words(value) {
  return new Set(String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean));
}

function recall(expected, actual) {
  const left = words(expected);
  const right = words(actual);
  if (!left.size || !right.size) return 0;
  return [...left].filter(token => right.has(token)).length / left.size;
}

function candidateSignals(track, candidate) {
  const parsed = parseTracklistLine(candidate.title || '');
  const candidateTitle = parsed?.artist !== 'Unknown Artist' ? parsed.title : candidate.title;
  const title = Math.max(recall(track.title, candidateTitle), recall(track.title, candidate.title));
  const artists = String(track.artist || '').split(/[,/&]+|\s+x\s+/i).map(value => value.trim()).filter(Boolean);
  const candidateArtistText = `${candidate.artist || ''} ${candidate.uploader || ''} ${parsed?.artist !== 'Unknown Artist' ? parsed.artist : ''} ${candidate.title || ''}`;
  const primary = artists[0] || track.artist;
  const artist = Math.max(recall(track.artist, candidateArtistText), recall(primary, candidateArtistText) * 0.86);
  const uploader = Math.max(recall(candidate.artist, track.artist), recall(candidate.uploader, track.artist));
  const candidateVersion = parsed?.mix || candidate.title?.match(/\s[-–—]\s+([^–—-]*(?:remix|mix|edit|rework|version|dub|vip|bootleg))$/i)?.[1] || '';
  const requestedVersion = String(track.mix || '').trim();
  const version = requestedVersion ? recall(requestedVersion, candidate.title) : 1;
  const versionCompatible = requestedVersion
    ? version >= 0.75
    : !candidateVersion || /\boriginal mix\b|\balbum version\b/i.test(candidateVersion);
  const durationDelta = track.durationSec > 0 && candidate.durationSec > 0
    ? Math.abs(track.durationSec - candidate.durationSec) : Infinity;
  const duration = durationDelta <= 4 ? 1 : durationDelta <= 10 ? 0.8 : durationDelta <= 20 ? 0.35 : 0;
  let score = title * 0.45 + artist * 0.25 + duration * 0.18 + version * 0.12;
  if (uploader >= 0.7) score += 0.04;
  if (/\b(lyrics?|karaoke)\b/i.test(candidate.title || '')) score -= 0.1;
  if (/\b(cover|sped up|slowed|nightcore)\b/i.test(candidate.title || '')) score -= 0.3;
  if (!versionCompatible) score -= 0.32;
  return { score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), title, artist, durationDelta, versionCompatible };
}

export function scoreCandidate(track, candidate) {
  return candidateSignals(track, candidate).score;
}

export function rankCandidates(track, candidates) {
  const unique = new Map();
  for (const candidate of candidates) {
    if (candidate.url && !unique.has(candidate.url)) unique.set(candidate.url, { ...candidate, score: scoreCandidate(track, candidate) });
  }
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  const first = ranked[0];
  const signals = first && candidateSignals(track, first);
  const confident = !!first && first.score >= 0.78 && signals.title >= 0.82 && signals.artist >= 0.55
    && signals.durationDelta <= 10 && signals.versionCompatible;
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
      return [{ url, title: item.title || '', artist: item.artist || item.uploader || '', uploader: item.uploader || '',
        durationSec: Math.round(item.duration || 0), provider: prefix.startsWith('sc') ? 'SoundCloud' : 'YouTube' }];
    } catch { return []; }
  });
}

export async function findAudioMatches(track, signal) {
  const binary = await resolveBinary('yt-dlp');
  if (!binary) throw new Error('Search engine is missing');
  const firstArtists = String(track.artist || '').split(/[,/&]+|\s+x\s+/i).map(value => value.trim()).filter(Boolean).slice(0, 2).join(', ');
  const query = buildSearchQuery(firstArtists || track.artist, track.title, track.mix);
  let youtube = [];
  try { youtube = await search(binary, 'ytsearch5', query, signal); }
  catch (err) { if (signal?.aborted) throw err; }
  if (youtube.length) {
    const ranked = rankCandidates(track, youtube);
    if (ranked.chosen) return ranked;
  }
  let soundcloud = [];
  try { soundcloud = await search(binary, 'scsearch5', query, signal); }
  catch (err) { if (signal?.aborted) throw err; }
  const candidates = [...youtube, ...soundcloud];
  if (!candidates.length) throw new Error('No matching audio found on YouTube or SoundCloud');
  return rankCandidates(track, candidates);
}
