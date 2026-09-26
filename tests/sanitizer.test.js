import test from 'node:test';
import assert from 'node:assert';
import { sanitizeExtension, sanitizeFileName } from '../src/main/engine/transcoder.js';
import { cleanTitle, cleanArtist } from '../src/main/engine/metadata.js';
import { buildDestinationPath } from '../src/main/engine/organizer.js';

test('sanitizeExtension strips corrupt trailing extensions', () => {
  assert.strictEqual(sanitizeExtension('track.mp3.mpeg'), 'track.mp3');
  assert.strictEqual(sanitizeExtension('track.m4a.mp4'), 'track.m4a');
  assert.strictEqual(sanitizeExtension('track.mp3.webm'), 'track.mp3');
  assert.strictEqual(sanitizeExtension('track.mp3.opus'), 'track.mp3');
  assert.strictEqual(sanitizeExtension('track.mp3'), 'track.mp3');
});

test('sanitizeFileName removes Windows illegal characters and control chars', () => {
  const illegal = 'AC/DC: Highway to Hell *Live*?';
  const clean = sanitizeFileName(illegal);
  assert.strictEqual(clean.includes('/'), false);
  assert.strictEqual(clean.includes(':'), false);
  assert.strictEqual(clean.includes('*'), false);
  assert.strictEqual(clean.includes('?'), false);

  // Control characters (\n, \r, \t)
  const withControls = sanitizeFileName("Song\nTitle\r\tName");
  assert.strictEqual(withControls.includes('\n'), false);
  assert.strictEqual(withControls.includes('\r'), false);
  assert.strictEqual(withControls.includes('\t'), false);

  // Trailing dots and spaces
  const trailingDot = sanitizeFileName("Artist - Song Title... ");
  assert.strictEqual(trailingDot.endsWith('.'), false);
  assert.strictEqual(trailingDot.endsWith(' '), false);

  // Reserved DOS device names
  const reservedCon = sanitizeFileName("CON");
  assert.strictEqual(reservedCon.startsWith('_'), true);
  const reservedAux = sanitizeFileName("AUX.mp3");
  assert.strictEqual(reservedAux.startsWith('_'), true);
});

test('cleanTitle strips junk labels, quotes, and trailing audio extensions', () => {
  assert.strictEqual(cleanTitle('Song Title [Official Music Video]'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title (Lyrics)'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title [FREE DOWNLOAD]'), 'Song Title');
  assert.strictEqual(cleanTitle('"Quoted Song Title"'), 'Quoted Song Title');
  assert.strictEqual(cleanTitle('Song Title.mp3'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title.wav'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title.flac'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title [Official Visualizer]'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title (Visualizer)'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title [Audio]'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title (Official Audio)'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title (Music Video)'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title (4K)'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title [HD]'), 'Song Title');
  assert.strictEqual(cleanTitle('Song Title...'), 'Song Title');
});

test('cleanTitle preserves legitimate remix and mix descriptors while stripping junk', () => {
  assert.strictEqual(cleanTitle('World, Hold On (FISHER Rework) [Official Visualizer]'), 'World, Hold On (FISHER Rework)');
  assert.strictEqual(cleanTitle('Losing It (Extended Mix) [Audio]'), 'Losing It (Extended Mix)');
  assert.strictEqual(cleanTitle('Glue (Original Mix) (Official Music Video 4K)'), 'Glue (Original Mix)');
});

test('cleanArtist strips uploader suffixes and quotes', () => {
  assert.strictEqual(cleanArtist('Avicii - Topic'), 'Avicii');
  assert.strictEqual(cleanArtist('Spinnin Records'), 'Spinnin');
  assert.strictEqual(cleanArtist('"Calvin Harris"'), 'Calvin Harris');
});

test('buildDestinationPath uses song names and explicit folder layouts', () => {
  const flat = buildDestinationPath({
    baseDir: 'C:\\Music',
    mode: 'flat',
    index: 18,
    artist: 'Bob Sinclar',
    title: 'World, Hold On',
    mix: 'FISHER Rework',
    ext: '.mp3'
  });
  assert.strictEqual(flat, 'C:\\Music\\World, Hold On (FISHER Rework).mp3');

  // Avoid .mp3.mp3 double extension when title already contains .mp3
  const withExt = buildDestinationPath({
    baseDir: 'C:\\Music',
    mode: 'flat',
    index: 1,
    artist: 'Fisher',
    title: 'Losing It.mp3',
    ext: '.mp3'
  });
  assert.strictEqual(withExt, 'C:\\Music\\Losing It.mp3');

  const partitioned = buildDestinationPath({
    baseDir: 'C:\\Music',
    mode: 'genre',
    index: 1,
    artist: 'Calvin Harris',
    title: 'Miracle',
    genre: 'House / Dance',
    ext: '.mp3'
  });
  assert.strictEqual(partitioned, 'C:\\Music\\House _ Dance\\Miracle.mp3');

  const artistFolder = buildDestinationPath({ baseDir: 'C:\\Music', mode: 'artist', artist: 'Calvin Harris', title: 'Miracle' });
  assert.strictEqual(artistFolder, 'C:\\Music\\Calvin Harris\\Miracle.mp3');
  const unknownGenre = buildDestinationPath({ baseDir: 'C:\\Music', mode: 'genre', artist: 'Calvin Harris', title: 'Miracle' });
  assert.strictEqual(unknownGenre, 'C:\\Music\\Unknown Genre\\Miracle.mp3');

  // Handle long titles and trailing dots safely for Windows MAX_PATH
  const longPath = buildDestinationPath({
    baseDir: 'C:\\Music',
    mode: 'flat',
    index: 5,
    artist: 'A Very Long Artist Name That Could Potentially Cause Issues If Left Completely Unchecked And Super Long',
    title: 'An Extremely Long Track Title Live At Ultra Miami Festival 2026 With All Extra Details And Description Text Attached...',
    mix: 'Extended Ultra Club Mix 2026',
    ext: '.mp3'
  });
  assert.ok(longPath.length < 240, `Destination path should be under Windows MAX_PATH (${longPath.length} chars)`);
  assert.ok(!longPath.includes('...'), 'Trailing dots should be stripped from destination path');
});
