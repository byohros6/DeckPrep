import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import NodeID3 from 'node-id3';
import { resolveBinary } from '../src/main/engine/binaryManager.js';
import { DownloadQueue, downloadError } from '../src/main/engine/downloadQueue.js';

const execFileAsync = promisify(execFile);

test('an audio URL downloads, transcodes, tags, and keeps source intact', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deckprep-test-'));
  const source = path.join(root, 'source.mp3');
  const output = path.join(root, 'output');
  fs.mkdirSync(output);
  const ffmpeg = await resolveBinary('ffmpeg');
  let server;
  try {
    await execFileAsync(ffmpeg, [
      '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', source
    ]);
    const original = fs.readFileSync(source);
    server = http.createServer((_, response) => {
      response.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': original.length });
      response.end(original);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/source.mp3`;
    const summary = await new Promise(resolve => {
      const queue = new DownloadQueue({ destinationDir: output, concurrency: 1, onAllCompleted: resolve });
      queue.load([{ index: 7, artist: 'Test Artist', title: 'Test Track', durationSec: 0, directUrl: url }]);
      queue.start();
    });
    assert.equal(summary.completed, 1);
    assert.equal(summary.errors, 0);
    assert.deepEqual(fs.readFileSync(source), original);
    const exported = fs.readdirSync(output).filter(name => name.endsWith('.mp3'));
    assert.equal(exported.length, 1);
    assert.equal(exported[0], 'Test Track.mp3');
    const tags = NodeID3.read(path.join(output, exported[0]));
    assert.equal(tags.artist, 'Test Artist');
    assert.equal(tags.title, 'Test Track');
    assert.equal(tags.album, undefined);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('same song titles get a safe suffix instead of overwriting another export', () => {
  const queue = new DownloadQueue({ destinationDir: 'C:\\Music', concurrency: 2 });
  const first = queue.destinationFor({ artist: 'Stefano Noferini', title: 'One Love (Original Mix)' });
  const second = queue.destinationFor({ artist: 'Stefano Noferini', title: 'One Love (Original Mix)' });
  assert.equal(first.outputPath, 'C:\\Music\\One Love (Original Mix).mp3');
  assert.equal(second.outputPath, 'C:\\Music\\One Love (Original Mix) (Stefano Noferini).mp3');
});

test('protected source failures explain that another recording is needed', () => {
  assert.match(downloadError(new Error('ERROR: This video is DRM protected')), /protected and cannot be exported/i);
});
