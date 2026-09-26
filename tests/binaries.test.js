import test from 'node:test';
import assert from 'node:assert/strict';
import { executablePath } from '../src/main/engine/binaryManager.js';

test('packaged executables resolve outside the asar archive', () => {
  assert.equal(
    executablePath('C:\\DeckPrep\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe'),
    'C:\\DeckPrep\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe'
  );
  assert.equal(executablePath('C:\\DeckPrep\\resources\\bin\\yt-dlp.exe'), 'C:\\DeckPrep\\resources\\bin\\yt-dlp.exe');
});
