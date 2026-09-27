import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppleMusicPage } from '../src/main/engine/providers/appleMusic.js';

function page(count) {
  const schema = { name: 'Practice set', numTracks: count, author: { name: 'DJ Example' } };
  const server = { data: [{ data: { sections: [{ items: [
    { title: 'First Song', artistName: 'First Artist', duration: 180000,
      contentDescriptor: { kind: 'song', url: 'https://music.apple.com/us/song/first/1' } },
    { title: 'Second Song', artistName: 'Second Artist', duration: 240000,
      contentDescriptor: { kind: 'song', url: 'https://music.apple.com/us/song/second/2' } }
  ] }] } }] };
  return `<script id=schema:music-playlist type="application/ld+json">${JSON.stringify(schema)}</script>`
    + `<script id="serialized-server-data" type="application/json">${JSON.stringify(server)}</script>`;
}

test('Apple public playlist imports its complete track metadata', () => {
  const result = parseAppleMusicPage(page(2), 'https://music.apple.com/us/playlist/practice/pl.example');
  assert.equal(result.title, 'Practice set');
  assert.equal(result.creator, 'DJ Example');
  assert.equal(result.tracks.length, 2);
  assert.equal(result.tracks[0].artist, 'First Artist');
  assert.equal(result.tracks[0].durationSec, 180);
});

test('Apple incomplete playlist is rejected with a useful fallback', () => {
  assert.throws(() => parseAppleMusicPage(page(3), 'https://music.apple.com/us/playlist/practice/pl.example'), /Paste a complete tracklist/);
});
