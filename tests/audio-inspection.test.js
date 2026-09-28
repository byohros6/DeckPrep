import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectAudio, summarizeAudio } from '../src/main/engine/audioInspection.js';
import { resolveBinary } from '../src/main/engine/binaryManager.js';
import { DownloadQueue } from '../src/main/engine/downloadQueue.js';
import { exportCrate } from '../src/main/engine/crateExport.js';
const exec = promisify(execFile);

test('long tails are flagged but internal breaks and quiet reverb are not cut', () => {
  const music = Array(1800).fill(0.3), silent = Array(4840).fill(0);
  const result = summarizeAudio([...music, ...silent], 664);
  assert.equal(result.ending.startSec, 180); assert.equal(result.ending.suggestedEndSec, 182);
  assert.equal(summarizeAudio([...music, ...silent, ...music], 844).ending, null);
  assert.equal(summarizeAudio([...music, ...Array(90).fill(0.002)], 189).ending, null);
});

test('real decoding rejects fake MP3 and silent audio, and preserves sound in either channel', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckprep-inspection-'));
  try {
    const binary = await resolveBinary('ffmpeg');
    const fake = path.join(dir, 'fake.mp3'); await fs.writeFile(fake, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(10000)]));
    await assert.rejects(inspectAudio(fake));
    const silent = path.join(dir, 'silent.wav');
    await exec(binary, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=stereo', '-t', '2', silent]);
    await assert.rejects(inspectAudio(silent), /silent/);
    const stereo = path.join(dir, 'stereo.wav');
    await exec(binary, ['-y', '-f', 'lavfi', '-i', 'aevalsrc=0|0.2*sin(440*2*PI*t):s=8000:d=3', stereo]);
    const result = await inspectAudio(stereo); assert.equal(result.ending, null); assert.ok(result.durationSec >= 2.99);
    await assert.rejects(inspectAudio(stereo, {expectedDurationSec: 20}), /duration/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(inspectAudio(stereo, {signal: controller.signal}));
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});

test('local source waits for approval then trims verified export without changing the source', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckprep-review-test-'));
  try {
    const binary = await resolveBinary('ffmpeg'); const source = path.join(dir, 'source.wav');
    await exec(binary, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-af', 'apad=pad_dur=15', source]);
    const original = await fs.readFile(source); let track;
    const run = async data => {
      const queue = new DownloadQueue({destinationDir: path.join(dir, 'export'), cacheDir: path.join(dir, 'cache'), onTrackCompleted: value => { track = value; }});
      queue.load([data]); queue.start(); return queue.completion;
    };
    assert.equal((await run({title: 'Song', artist: 'Artist', localPath: source})).review, 1);
    assert.equal(track.status, 'audio_review');
    assert.equal((await run({...track, trimDecision: {action: 'trim', endSec: 5}})).completed, 1);
    assert.ok(Math.abs(track.verification.durationSec - 5) < 0.1);
    assert.deepEqual(await fs.readFile(source), original);
    assert.ok(await fs.stat(track.outputPath + '.deckprep.json'));
    const result = await exportCrate([track, {id: 'pending', title: 'Pending', status: 'audio_review'}], path.dirname(track.outputPath), 'Test crate');
    assert.equal(result.included, 1); assert.equal(result.excluded.length, 1);
    assert.match(await fs.readFile(result.playlist, 'utf8'), /\.\/Song.mp3/);
    await fs.appendFile(track.outputPath, 'changed');
    await assert.rejects(exportCrate([track], path.dirname(track.outputPath)), /No verified/);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});
