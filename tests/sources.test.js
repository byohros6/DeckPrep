import test from 'node:test';
import assert from 'node:assert/strict';
import { detectInputType, sanitizeUrl, parseInput } from '../src/main/engine/sources.js';
import { buildSearchQuery } from '../src/main/engine/resolver.js';
import { checkBinaries } from '../src/main/engine/binaryManager.js';

test('link sources and pasted tracklists are recognized', () => {
  assert.equal(detectInputType('https://open.spotify.com/playlist/abc'), 'spotify');
  assert.equal(detectInputType('soundcloud.com/user/track'), 'soundcloud');
  assert.equal(detectInputType('https://music.youtube.com/watch?v=abc'), 'youtube');
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

test('download and transcoding engines are present', async () => {
  const status = await checkBinaries();
  assert.equal(status.ytDlp.found, true);
  assert.equal(status.ffmpeg.found, true);
});
