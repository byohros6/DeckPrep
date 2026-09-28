import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadQueue } from '../src/main/engine/downloadQueue.js';

test('completion waits for all durable callbacks and fires exactly once', async () => {
  let saved = 0, finished = 0;
  const queue = new DownloadQueue({destinationDir: '.', concurrency: 4,
    onTrackCompleted: async () => { await new Promise(resolve => setTimeout(resolve, 15)); saved++; },
    onAllCompleted: () => { assert.equal(saved, 12); finished++; }});
  queue.load(Array.from({length: 12}, (_, i) => ({title: 'Track ' + i})));
  queue.processTrack = async track => { track.status = 'done'; };
  queue.start(); await queue.completion; assert.equal(finished, 1);
});

test('cancel aborts running work and does not start queued work', async () => {
  let started = 0;
  const queue = new DownloadQueue({destinationDir: '.', concurrency: 2});
  queue.load(Array.from({length: 12}, (_, i) => ({title: 'Track ' + i})));
  queue.processTrack = async () => { started++; await new Promise(resolve => queue.abortController.signal.addEventListener('abort', resolve, {once: true})); };
  queue.start(); const start = Date.now(); queue.cancel(); const summary = await queue.completion;
  assert.equal(summary.cancelled, true); assert.equal(started, 2); assert.ok(Date.now() - start < 5000);
});
