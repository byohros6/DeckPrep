import test from 'node:test';
import assert from 'node:assert/strict';
import { detectInputType, sanitizeUrl, parseInput, normalizeTrack, normalizeSoundCloudOembed } from '../src/main/engine/sources.js';
import { buildSearchQuery } from '../src/main/engine/resolver.js';
import { checkBinaries } from '../src/main/engine/binaryManager.js';

test('link sources and pasted tracklists are recognized', () => {
  assert.equal(detectInputType('https://open.spotify.com/playlist/abc'), 'spotify');
  assert.equal(detectInputType('soundcloud.com/user/track'), 'soundcloud');
  assert.equal(detectInputType('https://music.youtube.com/watch?v=abc'), 'youtube');
  assert.equal(detectInputType('https://music.apple.com/us/playlist/example/pl.123'), 'apple');
  assert.equal(detectInputType('Artist - Song'), 'text');
});

test('tracking parameters are removed from a pasted link', () => {
  assert.equal(sanitizeUrl('https://open.spotify.com/track/abc?si=123'), 'https://open.spotify.com/track/abc');
});

test('pasted tracklist loads and retains mix information', async () => {
  const parsed = await parseInput('01. Artist - Track (Extended Mix) [6:22]');
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].durationSec, 382);
  assert.equal(parsed.tracks[0].mix, 'Extended Mix');
  assert.match(buildSearchQuery(parsed.tracks[0].artist, parsed.tracks[0].title, parsed.tracks[0].mix), /Extended Mix/);
});

test('multiple links load into one queue', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const title = url.endsWith('/first') ? 'First track' : 'Second track';
    const data = { props: { pageProps: { state: { data: { entity: { title, artists: [{ name: 'Artist' }] } } } } } };
    return { ok: true, text: async () => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>` };
  };
  try {
    const result = await parseInput('https://open.spotify.com/track/first\nhttps://open.spotify.com/track/second');
    assert.equal(result.source, 'links');
    assert.deepEqual(result.tracks.map(track => track.title), ['First track', 'Second track']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SoundCloud playlist entries without titles stay in the queue and resolve to full metadata', () => {
  const url = 'https://soundcloud.com/moanrecordings/hector-couto-rendher-break-down-dennis-cruz-remix';
  const pending = normalizeTrack({ url, playlist_title: 'Deep tech/minimal/tech house extended' }, 'soundcloud', url, 1);
  assert.equal(pending.needsMetadata, true);
  assert.equal(pending.directUrl, url);
  assert.match(pending.title, /hector couto rendher/i);
  const resolved = normalizeTrack({ webpage_url: url, title: 'Hector Couto, Rendher - Break Down (Dennis Cruz Remix)', artist: 'Hector Couto, Rendher', duration: 342 }, 'soundcloud', url);
  assert.equal(resolved.needsMetadata, false);
  assert.equal(resolved.title, 'Break Down (Dennis Cruz Remix)');
  assert.equal(resolved.durationSec, 342);
});

test('SoundCloud public embed metadata becomes a reviewable track', () => {
  const track = { index: 6, source: 'soundcloud', soundcloudId: '1576004935', directUrl: 'https://api-v2.soundcloud.com/tracks/1576004935', needsMetadata: true, durationSec: 0 };
  const result = normalizeSoundCloudOembed({ title: 'Kamino - Lower Frequency (Original Mix) by Andhera Records', author_name: 'Andhera Records', thumbnail_url: 'https://i1.sndcdn.com/artwork.jpg' }, track);
  assert.equal(result.artist, 'Kamino');
  assert.equal(result.title, 'Lower Frequency (Original Mix)');
  assert.equal(result.mix, 'Original Mix');
  assert.equal(result.needsMetadata, false);
  assert.equal(result.durationSec, 0);
  assert.equal(result.soundcloudId, '1576004935');
});

test('YouTube title ending with channel artist is not reversed', () => {
  const track = normalizeTrack({ title: 'BELLAKEO (Video Oficial) - Peso Pluma, Anitta', channel: 'Peso Pluma', id: 'example', duration: 235 }, 'youtube', 'https://youtube.com/watch?v=example');
  assert.equal(track.title, 'BELLAKEO');
  assert.equal(track.artist, 'Peso Pluma, Anitta');
  assert.equal(track.durationSec, 235);
});

test('download and transcoding engines are present', async () => {
  const status = await checkBinaries();
  assert.equal(status.ytDlp.found, true);
  assert.equal(status.ffmpeg.found, true);
});
