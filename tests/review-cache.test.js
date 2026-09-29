import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pruneReviewCache} from '../src/main/engine/reviewCache.js';

test('startup cache cleanup removes only old unreferenced app audio', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deckprep-cache-test-'));
  const cache = path.join(root, 'audio-cache');
  const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const make = async (name, filename = 'source.mp3', aged = true) => {
    const directory = path.join(cache, name);
    await fs.mkdir(directory, {recursive: true});
    const file = path.join(directory, filename);
    await fs.writeFile(file, 'generated fixture');
    if (aged) await fs.utimes(directory, old / 1000, old / 1000);
    return file;
  };
  try {
    const orphan = await make('audio-orphan');
    const reviewed = await make('audio-reviewed');
    const recent = await make('audio-recent', 'source.mp3', false);
    const unexpected = await make('audio-unexpected', 'personal.txt');
    const unrelated = await make('unrelated', 'source.mp3');
    const result = await pruneReviewCache(cache, [{reviewSourcePath: reviewed}]);
    assert.deepEqual(result, {removed: 1, kept: 3, errors: 0});
    await assert.rejects(fs.stat(orphan), {code: 'ENOENT'});
    for (const file of [reviewed, recent, unexpected, unrelated]) assert.equal((await fs.readFile(file, 'utf8')), 'generated fixture');
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});

test('missing cache needs no cleanup', async () => {
  const result = await pruneReviewCache(path.join(os.tmpdir(), 'deckprep-cache-missing-' + crypto.randomUUID()));
  assert.deepEqual(result, {removed: 0, kept: 0, errors: 0});
});
