import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from './binaryManager.js';
import { parseBulkText, parseTracklistLine } from './parser.js';
import { cleanArtist, cleanTitle } from './metadata.js';

const execFileAsync = promisify(execFile);

export function detectInputType(input) {
  const value = String(input || '').trim();
  if (/^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\//i.test(value)) return 'spotify';
  if (/^(?:https?:\/\/)?(?:(?:www|m)\.)?soundcloud\.com\//i.test(value) || /^(?:https?:\/\/)?on\.soundcloud\.com\//i.test(value)) return 'soundcloud';
  if (/^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\//i.test(value)) return 'youtube';
  return 'text';
}

export function sanitizeUrl(input) {
  const value = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(value);
  for (const key of ['si', 'pt', 'utm_source', 'utm_medium', 'fbclid']) url.searchParams.delete(key);
  return url.toString();
}

export function normalizeTrack(item, source, fallbackUrl, index = 0) {
  const directUrl = item.webpage_url || item.original_url || item.url || fallbackUrl;
  const needsMetadata = !item.title && !item.name;
  let fallbackTitle = `Track ${String(index || 1).padStart(3, '0')}`;
  if (needsMetadata && directUrl) {
    try {
      const slug = decodeURIComponent(new URL(directUrl).pathname.split('/').filter(Boolean).at(-1));
      if (slug && !/^\d+$/.test(slug)) fallbackTitle = slug.replace(/[-_]+/g, ' ');
    } catch { /* Keep the numbered placeholder. */ }
  }
  const rawTitle = item.title || item.name || fallbackTitle;
  const parsed = parseTracklistLine(rawTitle);
  const explicitArtist = item.artist || item.artists?.map(artist => artist.name).join(', ');
  const parsedArtist = parsed?.artist !== 'Unknown Artist' ? parsed?.artist : '';
  const artist = needsMetadata ? '—' : cleanArtist(explicitArtist || parsedArtist || item.uploader || item.channel || 'Unknown Artist');
  const title = cleanTitle(parsedArtist ? parsed.title : rawTitle);
  let resolvedUrl = directUrl;
  if (source === 'youtube' && item.id && !/^https?:\/\//i.test(resolvedUrl)) resolvedUrl = `https://www.youtube.com/watch?v=${item.id}`;
  return {
    artist, title, mix: parsed?.mix || '',
    album: item.album || '', year: item.year || null,
    artworkUrl: item.thumbnail || item.artworkUrl || null,
    durationSec: Math.round(item.duration || item.durationSec || 0),
    directUrl: resolvedUrl, source, needsMetadata
  };
}

async function extractWithYtDlp(url, source) {
  const binary = await resolveBinary('yt-dlp');
  if (!binary) throw new Error('yt-dlp is missing. Run npm run setup:engine.');
  const { stdout } = await execFileAsync(binary, ['--dump-json', '--flat-playlist', '--', url], { maxBuffer: 40 * 1024 * 1024 });
  const items = stdout.split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      return [JSON.parse(line)];
    } catch { return []; }
  });
  const tracks = items.flatMap((item, index) => {
    if (/\[(deleted|private) video\]/i.test(item.title || '')) return [];
    if (!item.title && !item.name && !(item.webpage_url || item.original_url || item.url)) return [];
    return [normalizeTrack(item, source, url, index + 1)];
  });
  if (!tracks.length) throw new Error('No tracks found at that link');
  return { title: items[0]?.playlist_title || items[0]?.playlist || (tracks.length === 1 ? tracks[0].title : `${source} collection`), tracks };
}

function spotifyTrack(item, albumName, art) {
  const track = item.track || item;
  return {
    title: track.title || track.name,
    artist: track.subtitle || track.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist',
    album: track.album?.title || track.album?.name || albumName || '',
    artworkUrl: track.coverArt?.sources?.[0]?.url || track.album?.images?.[0]?.url || art || null,
    durationSec: Math.round((track.duration_ms || track.duration || 0) / 1000),
    year: track.album?.release_date ? Number(track.album.release_date.slice(0, 4)) : null,
    mix: parseTracklistLine(track.title || track.name || '')?.mix || '',
    source: 'spotify'
  };
}

async function extractSpotify(url) {
  const match = url.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/i);
  if (!match) throw new Error('Invalid Spotify link');
  const [, type, id] = match;
  const embed = await fetch(`https://open.spotify.com/embed/${type}/${id}`);
  if (!embed.ok) throw new Error(`Spotify returned HTTP ${embed.status}`);
  const html = await embed.text();
  const jsonText = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!jsonText) throw new Error('Spotify did not provide track metadata for this link');
  const entity = JSON.parse(jsonText)?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('Spotify track metadata was unavailable');
  const title = entity.title || entity.name || 'Spotify collection';
  const artworkUrl = entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url || null;
  const items = type === 'track' ? [entity] : entity.trackList || [];
  const tracks = items.map(item => spotifyTrack(item, title, artworkUrl)).filter(track => track.title);
  if (!tracks.length) throw new Error('No tracks found in this Spotify link');
  return { title, tracks };
}

export async function parseInput(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Paste a link or tracklist first');
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.some(line => detectInputType(line) !== 'text' || /^https?:\/\//i.test(line))) {
    if (!lines.every(line => detectInputType(line) !== 'text')) throw new Error('Paste links on separate lines, or use a tracklist');
    const results = [];
    for (const line of lines) {
      const type = detectInputType(line);
      const url = sanitizeUrl(line);
      results.push(type === 'spotify' ? await extractSpotify(url) : await extractWithYtDlp(url, type));
    }
    return { source: 'links', title: `${lines.length} links`, tracks: results.flatMap(result => result.tracks) };
  }
  const type = detectInputType(raw);
  if (type === 'text') {
    if (/^https?:\/\//i.test(raw)) throw new Error('This link source is not supported');
    const tracks = parseBulkText(raw);
    if (!tracks.length) throw new Error('No tracks found in the pasted list');
    return { source: 'text', title: 'Pasted tracklist', tracks };
  }
  const url = sanitizeUrl(raw);
  const entity = type === 'spotify' ? await extractSpotify(url) : await extractWithYtDlp(url, type);
  return { source: type, ...entity };
}
