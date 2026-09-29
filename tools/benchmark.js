import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { createSessionStore } from '../src/main/persistence.js';
import { rankCandidates } from '../src/main/engine/matching.js';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckprep-benchmark-'));
try {
  const results = [];
  for (const count of [100, 500, 1000]) {
    const tracks = Array.from({length: count}, (_, i) => ({title: `Track ${i}`, artist: 'Benchmark artist', durationSec: 180, index: i + 1}));
    const start = performance.now();
    for (const track of tracks) rankCandidates(track, [{...track, url: 'https://youtube.com/watch?v=fixture'}]);
    const matchingMs = performance.now() - start;
    const saving = performance.now(); const store = createSessionStore(path.join(dir, count + '.json')); await store.save({tracks}); await store.read();
    results.push({count, matchingMs: Math.round(matchingMs), saveRestoreMs: Math.round(performance.now() - saving), rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)});
  }
  console.log(JSON.stringify({date: new Date().toISOString(), platform: os.platform(), cpu: os.cpus()[0]?.model, node: process.version, note: 'Synthetic matching and persistence only; not live-provider throughput or UI responsiveness.', results}, null, 2));
} finally { await fs.rm(dir, {recursive: true, force: true}); }
