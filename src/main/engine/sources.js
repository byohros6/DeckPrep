import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from './binaryManager.js';
import { parseBulkText, parseTracklistLine } from './parser.js';
import { cleanArtist, cleanTitle } from './metadata.js';
import { extractAppleMusic } from './providers/appleMusic.js';

const execFileAsync = promisify(execFile);
const soundCloudMetadataCache = new Map();

export function detectInputType(input) {
  const value = String(input || '').trim();
  if (/^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\//i.test(value)) return 'spotify';
  if (/^(?:https?:\/\/)?music\.apple\.com\/[a-z]{2}\/(?:playlist|album|song)\//i.test(value)) return 'apple';
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
  const channel = item.channel || item.uploader || '';
  const rightSideIsArtist = source === 'youtube' && !explicitArtist && parsedArtist && channel
    && parsed.title.toLowerCase().includes(channel.toLowerCase())
    && !parsedArtist.toLowerCase().includes(channel.toLowerCase());
  const artist = needsMetadata ? '—' : cleanArtist(explicitArtist || (rightSideIsArtist ? parsed.title : parsedArtist) || channel || 'Unknown Artist');
  const title = cleanTitle(rightSideIsArtist ? parsedArtist : parsedArtist ? parsed.title : rawTitle);
  let resolvedUrl = directUrl;
  if (source === 'youtube' && item.id && !/^https?:\/\//i.test(resolvedUrl)) resolvedUrl = `https://www.youtube.com/watch?v=${item.id}`;
  return {
    artist, title, mix: rightSideIsArtist ? parseTracklistLine(title)?.mix || '' : parsed?.mix || '',
    album: item.album || '', year: item.year || null,
    artworkUrl: item.thumbnail || item.artworkUrl || null,
    durationSec: Math.round(item.duration || item.durationSec || 0),
    directUrl: resolvedUrl, source, needsMetadata,
    soundcloudId: source === 'soundcloud' && item.id ? String(item.id) : undefined
  };
}

export function normalizeSoundCloudOembed(data, track) {
  const suffix = data.author_name ? ` by ${data.author_name}` : '';
  const rawTitle = suffix && data.title?.endsWith(suffix) ? data.title.slice(0, -suffix.length) : data.title;
  if (!rawTitle) throw new Error('SoundCloud did not provide a track title');
  const parsed = parseTracklistLine(rawTitle);
  const artist = parsed?.artist !== 'Unknown Artist' ? parsed.artist : data.author_name || 'Unknown Artist';
  return {
    ...track,
    artist: cleanArtist(artist),
    title: cleanTitle(parsed?.artist !== 'Unknown Artist' ? parsed.title : rawTitle),
    mix: parsed?.mix || '',
    artworkUrl: data.thumbnail_url || track.artworkUrl || null,
    needsMetadata: false
  };
}

async function soundCloudOembed(url, signal) {
  if (soundCloudMetadataCache.has(url)) return soundCloudMetadataCache.get(url);
  const endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const timeout = AbortSignal.timeout(10000);
    let response;
    try {
      response = await fetch(endpoint, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (err) {
      if (signal?.aborted || attempt === 2) throw err;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      continue;
    }
    if (response.ok) {
      const data = await response.json();
      soundCloudMetadataCache.set(url, data);
      return data;
    }
    if (response.status === 404) throw new Error('This track is unavailable on SoundCloud');
    if (response.status !== 429 && response.status < 500) throw new Error(`SoundCloud returned HTTP ${response.status}`);
    if (attempt === 2) throw new Error(`SoundCloud returned HTTP ${response.status}`);
    await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
  }
}

export async function fetchTrackDetails(track, signal) {
  if (!track.directUrl) throw new Error('This track has no source link');
  if (track.source === 'soundcloud' && track.soundcloudId) {
    const data = await soundCloudOembed(`https://api.soundcloud.com/tracks/${track.soundcloudId}`, signal);
    return normalizeSoundCloudOembed(data, track);
  }
  const binary = await resolveBinary('yt-dlp');
  if (!binary) throw new Error('yt-dlp is missing. Run npm run setup:engine.');
  const { stdout } = await execFileAsync(binary, ['--dump-json', '--no-playlist', '--', track.directUrl], {
    maxBuffer: 10 * 1024 * 1024, signal
  });
  const item = stdout.split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).find(value => value?.title);
  if (!item) throw new Error('Track details were unavailable');
  const details = normalizeTrack(item, track.source, track.directUrl, track.index);
  if (!details.album) details.album = track.album;
  return details;
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
  const result = { title: items[0]?.playlist_title || items[0]?.playlist || (tracks.length === 1 ? tracks[0].title : `${source} collection`), tracks };
  if (source === 'youtube' && items[0]?.playlist_id) {
    result.creator = items[0].playlist_uploader || '';
    result.artworkUrl = items[0].thumbnails?.at(-1)?.url || null;
    result.sourceUrl = items[0].playlist_webpage_url || url;
  }
  if (source === 'soundcloud' && items[0]?.playlist_id) {
    const playlistUrl = items[0].playlist_webpage_url || url;
    try {
      const info = await soundCloudOembed(playlistUrl);
      result.creator = info.author_name || items[0].playlist_uploader || '';
      result.artworkUrl = info.thumbnail_url || null;
      result.sourceUrl = playlistUrl;
    } catch {
      result.creator = items[0].playlist_uploader || '';
      result.sourceUrl = playlistUrl;
    }
  }
  return result;
}

function spotifyTrack(item, albumName, art) {
  const track = item.track || item;
  const id = track.uri?.split(':').at(-1);
  return {
    title: track.title || track.name,
    artist: track.subtitle || track.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist',
    album: track.album?.title || track.album?.name || albumName || '',
    artworkUrl: track.coverArt?.sources?.[0]?.url || track.album?.images?.[0]?.url || art || null,
    durationSec: Math.round((track.duration_ms || track.duration || 0) / 1000),
    year: track.album?.release_date ? Number(track.album.release_date.slice(0, 4)) : null,
    mix: parseTracklistLine(track.title || track.name || '')?.mix || '',
    source: 'spotify', sourceUrl: id ? `https://open.spotify.com/track/${id}` : null,
    needsMetadata: false
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
  return { title, tracks, creator: entity.subtitle || entity.owner?.name || '', artworkUrl, sourceUrl: url,
    warning: type === 'playlist' && tracks.length >= 100 ? 'Spotify exposed 100 tracks; the full playlist length could not be verified.' : '' };
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
      results.push(type === 'spotify' ? await extractSpotify(url) : type === 'apple' ? await extractAppleMusic(url) : await extractWithYtDlp(url, type));
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
  const entity = type === 'spotify' ? await extractSpotify(url) : type === 'apple' ? await extractAppleMusic(url) : await extractWithYtDlp(url, type);
  return { source: type, ...entity };
}
