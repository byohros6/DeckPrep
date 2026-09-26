import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates } from '../src/main/engine/matching.js';

const track = { artist: 'Peggy Gou', title: '(It Goes Like) Nanana', mix: '', durationSec: 231 };

test('a strong title, artist, and duration match can be selected automatically', () => {
  const result = rankCandidates(track, [
    { url: 'https://soundcloud.com/example/track', title: '(It Goes Like) Nanana', artist: 'Peggy Gou', durationSec: 232 },
    { url: 'https://youtube.com/watch?v=other', title: 'Nanana cover', artist: 'Other Artist', durationSec: 190 }
  ]);
  assert.equal(result.chosen?.url, 'https://soundcloud.com/example/track');
});

test('missing duration and a wrong version stay in review', () => {
  const missingDuration = rankCandidates({ ...track, durationSec: 0 }, [
    { url: 'https://soundcloud.com/example/track', title: '(It Goes Like) Nanana', artist: 'Peggy Gou', durationSec: 232 }
  ]);
  assert.equal(missingDuration.chosen, null);
  const wrongVersion = rankCandidates(track, [
    { url: 'https://soundcloud.com/example/remix', title: '(It Goes Like) Nanana (Extended Remix)', artist: 'Peggy Gou', durationSec: 360 }
  ]);
  assert.equal(wrongVersion.chosen, null);
});

test('a playlist remix matches even when the uploader is not a listed artist', () => {
  const remix = { title: 'Brighter Days', artist: 'Cajmere, Dajae, Marco Lys, Green Velvet', mix: 'Marco Lys Remix', durationSec: 383 };
  const result = rankCandidates(remix, [
    { url: 'https://youtube.com/watch?v=correct', title: 'Cajmere feat. Dajae - Brighter Days (Marco Lys Remix)', artist: 'Music Channel', durationSec: 383 },
    { url: 'https://youtube.com/watch?v=other', title: 'Cajmere feat. Dajae - Brighter Days (Original Mix)', artist: 'Cajmere', durationSec: 383 }
  ]);
  assert.equal(result.chosen?.url, 'https://youtube.com/watch?v=correct');
});

test('near duplicate uploads do not force review when the recording agrees', () => {
  const song = { title: 'I Remember', artist: 'deadmau5, Kaskade', mix: '', durationSec: 594 };
  const result = rankCandidates(song, [
    { url: 'https://youtube.com/watch?v=one', title: 'deadmau5 & Kaskade - I Remember', artist: 'deadmau5', durationSec: 594 },
    { url: 'https://youtube.com/watch?v=two', title: 'deadmau5 & Kaskade - I Remember [HQ]', artist: 'Other Channel', durationSec: 595 }
  ]);
  assert.equal(result.chosen?.url, 'https://youtube.com/watch?v=one');
});

test('an alternate remix or cover is not silently accepted', () => {
  const remix = { title: 'I Remember', artist: 'deadmau5, Kaskade', mix: 'John Summit Remix', durationSec: 240 };
  const wrongRemix = rankCandidates(remix, [
    { url: 'https://youtube.com/watch?v=wrong', title: 'deadmau5 & Kaskade - I Remember (Vocal Mix)', artist: 'deadmau5', durationSec: 240 }
  ]);
  assert.equal(wrongRemix.chosen, null);
  const cover = rankCandidates(track, [
    { url: 'https://youtube.com/watch?v=cover', title: 'Peggy Gou - (It Goes Like) Nanana cover', artist: 'Peggy Gou', durationSec: 231 }
  ]);
  assert.equal(cover.chosen, null);
});
