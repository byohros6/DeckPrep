import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('renderer bridge exposes link analysis and batch downloads', () => {
  const bridge = fs.readFileSync(new URL('../src/preload/preload.cjs', import.meta.url), 'utf8');
  assert.match(bridge, /parseInput/);
  assert.match(bridge, /startDownload/);
  assert.match(bridge, /cancelDownload/);
});
