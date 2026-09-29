import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateVersionCompatible, rankCandidates } from '../src/main/engine/matching.js';

const track = { artist: 'Peggy Gou', title: '(It Goes Like) Nanana', mix: '', durationSec: 231 };

test('explicit variants never auto-match a plain recording at identical duration', () => {
  for (const suffix of ['Live', 'Instrumental', 'Clean', 'Explicit', 'Sped Up', 'Slowed', 'Acapella', 'Cover', 'Extended Mix', 'Radio Edit']) {
    const result = rankCandidates(track, [{url: 'https://youtube.com/watch?v=variant', artist: track.artist, title: `${track.title} (${suffix})`, durationSec: track.durationSec}]);
    assert.equal(result.chosen, null, suffix);
  }
});

test('a named remix conflict is incompatible even for a manual choice', () => {
  const requested = {artist: 'Kerri Chandler', title: 'The Way It Goes', mix: 'Chris Stassy Remix', durationSec: 488};
  assert.equal(candidateVersionCompatible(requested, {title: 'The Way It Goes (Original Mix)', durationSec: 488}), false);
  assert.equal(candidateVersionCompatible(requested, {title: 'The Way It Goes (Chris Stassy Remix)', durationSec: 488}), true);
});

test('Hebrew tokens distinguish matching from unrelated titles', () => {
  const requested = {artist: 'עומר אדם', title: 'בת ים', durationSec: 200};
  assert.ok(rankCandidates(requested, [{url: 'https://youtube.com/watch?v=one', ...requested}]).chosen);
  assert.equal(rankCandidates(requested, [{url: 'https://youtube.com/watch?v=two', artist: requested.artist, title: 'שיר אחר', durationSec: 200}]).chosen, null);
});

test('similar remix names require every requested version word and failed alternatives are excluded', () => {
  const requested = {...track, mix: 'The Midnight Project Remix'};
  const wrong = {url: 'https://youtube.com/watch?v=wrong', artist: track.artist, title: track.title + ' (The Midnight City Remix)', durationSec: track.durationSec};
  assert.equal(rankCandidates(requested, [wrong]).chosen, null);
  assert.equal(rankCandidates({...track, blockedUrls: [wrong.url]}, [wrong]).candidates.length, 0);
});

test('a strong title, artist, and duration match can be selected automatically', () => {
  const result = rankCandidates(track, [
    { url: 'https://soundcloud.com/example/track', title: '(It Goes Like) Nanana', artist: 'Peggy Gou', durationSec: 232 },
    { url: 'https://youtube.com/watch?v=other', title: 'Nanana cover', artist: 'Other Artist', durationSec: 190 }
  ]);
  assert.equal(result.chosen?.url, 'https://soundcloud.com/example/track');
});

test('an exact title and artist can match when the source omits duration', () => {
  const missingDuration = rankCandidates({ ...track, durationSec: 0 }, [
    { url: 'https://soundcloud.com/example/track', title: '(It Goes Like) Nanana', artist: 'Peggy Gou', durationSec: 232 }
  ]);
  assert.equal(missingDuration.chosen?.url, 'https://soundcloud.com/example/track');
  const uncertain = rankCandidates({ ...track, durationSec: 0 }, [
    { url: 'https://youtube.com/watch?v=short', title: '(It Goes Like) Nanana', artist: 'Peggy Gou', durationSec: 30 }
  ]);
  assert.equal(uncertain.chosen, null);
});

test('a wrong version stays in review even with matching duration', () => {
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

test('alternative search does not suggest the blocked SoundCloud recording again', () => {
  const result = rankCandidates({ ...track, blockedOriginal: true, soundcloudId: '1708836636',
    directUrl: 'https://api.soundcloud.com/tracks/1708836636' }, [
    { url: 'https://soundcloud.com/owner/original', sourceId: '1708836636', provider: 'SoundCloud',
      title: '(It Goes Like) Nanana', artist: 'Peggy Gou', durationSec: 231 },
    { url: 'https://youtube.com/watch?v=other', sourceId: 'other', provider: 'YouTube',
      title: '(It Goes Like) Nanana', artist: 'Peggy Gou', durationSec: 232 }
  ]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.chosen?.url, 'https://youtube.com/watch?v=other');
});
