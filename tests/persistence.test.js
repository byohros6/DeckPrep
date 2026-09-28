import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSessionStore } from '../src/main/persistence.js';

test('concurrent saves are ordered and corrupted primary recovers last-good backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckprep-store-'));
  try {
    const file = path.join(dir, 'session.json'); const store = createSessionStore(file);
    await Promise.all(Array.from({length: 25}, (_, i) => store.save({version: 1, tracks: [{title: `Track ${i}`}]})));
    const saved = await store.read();
    assert.equal(saved.tracks[0].title, 'Track 24'); assert.equal(saved.version, 2); assert.ok(saved.tracks[0].id);
    await fs.writeFile(file, '{broken');
    const recovered = await store.read(); assert.equal(recovered.tracks[0].title, 'Track 23'); assert.equal(recovered.recoveredFromBackup, true);
    await store.clear(); assert.equal(await store.read(), null);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});
