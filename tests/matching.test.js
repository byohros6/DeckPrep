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
