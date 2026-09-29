import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSender, validSelection, validatePreferences, validateFolderName } from '../src/main/security.js';
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

test('playlist folder name accepts DAIR but never a path or Windows device name', () => {
  assert.equal(validateFolderName(' DAIR '), 'DAIR');
  assert.equal(validatePreferences({folderName: 'DAIR'}).folderName, 'DAIR');
  for (const name of ['../other', 'C:\\Music', 'CON', 'aux.mp3', 'name.', '<bad>']) {
    assert.throws(() => validateFolderName(name), {message: /folder name/i});
  }
});
