import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSender, validSelection, validatePreferences } from '../src/main/security.js';
test('IPC rejects foreign windows, subframes and untrusted locations', () => {
  const frame = {url: 'file:///app/index.html'}; const window = {mainFrame: frame};
  assert.doesNotThrow(() => validateSender({sender: window, senderFrame: frame}, window, frame.url));
  assert.throws(() => validateSender({sender: {}, senderFrame: frame}, window, frame.url));
  assert.throws(() => validateSender({sender: window, senderFrame: {...frame}}, window, frame.url));
  assert.throws(() => validateSender({sender: window, senderFrame: frame}, window, 'https://other'));
  assert.throws(() => validSelection([1, 1], [{index: 1}]));
  assert.throws(() => validSelection([9], [{index: 1}]));
});

test('IPC preferences reject invalid concurrency and do not accept arbitrary paths', () => {
  assert.throws(() => validatePreferences({concurrency: 100}));
  assert.throws(() => validatePreferences({concurrency: 1.5}));
  assert.throws(() => validatePreferences({mode: '../other'}));
  assert.deepEqual(validatePreferences({mode: 'flat', localPath: 'C:/secret', destinationDir: 'C:/other'}), {mode: 'flat'});
});
