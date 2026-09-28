import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from '../src/main/engine/binaryManager.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deckprep-e2e-'));
const source = path.join(root, 'עומר - Test song.wav');
const destination = path.join(root, 'crate');
await fs.mkdir(destination);
const ffmpeg = await resolveBinary('ffmpeg');
await promisify(execFile)(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-af', 'apad=pad_dur=15', source]);
const original = await fs.readFile(source);
let application;
try {
  const executable = process.env.DECKPREP_TEST_EXE;
  application = await electron.launch({...(executable ? {executablePath: executable} : {}), args: [...(executable ? [] : ['.']), '--test-user-data=' + path.join(root, 'state')], timeout: 30000});
  await application.evaluate(({dialog}, data) => {
    dialog.showOpenDialog = async (...args) => {
      const options = args.at(-1);
      return {canceled: false, filePaths: options.title?.includes('destination') ? [data.destination] : [data.source]};
    };
  }, {source, destination});
  let page = await application.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('#localFilesBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('tr[data-index]').length === 1);
  await page.locator('#browseBtn').click();
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => document.querySelector('.status-chip')?.textContent === 'Review ending');
  await page.waitForFunction(() => document.querySelector('#cancelBtn').disabled);
  await page.locator('tr[data-index]').click();
  await page.waitForFunction(() => document.querySelector('audio')?.duration > 17);
  await fs.mkdir('dist', {recursive: true});
  await page.screenshot({path: 'dist/qa-audio-review-beta9.png'});
  await application.close();
  application = await electron.launch({...(executable ? {executablePath: executable} : {}), args: [...(executable ? [] : ['.']), '--test-user-data=' + path.join(root, 'state')], timeout: 30000});
  page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#resumeSessionBtn').click();
  await page.waitForFunction(() => document.querySelector('.status-chip')?.textContent === 'Review ending');
  await page.locator('tr[data-index]').click();
  await page.waitForFunction(() => document.querySelector('audio')?.duration > 17);
  await page.locator('#audioReview input').fill('5');
  await page.getByRole('button', {name: 'Approve trimmed export'}).click();
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => document.querySelector('.status-chip')?.textContent === 'Verified');
  await page.waitForFunction(() => document.querySelector('#cancelBtn').disabled);
  await page.locator('#exportCrateBtn').click();
  await page.waitForFunction(() => document.querySelector('#summaryBanner').textContent.includes('verified tracks exported'));
  const files = await fs.readdir(destination);
  assert.ok(files.some(file => file.endsWith('.m3u8')));
  const manifest = JSON.parse(await fs.readFile(path.join(destination, files.find(file => file.endsWith('.mp3.deckprep.json'))), 'utf8'));
  assert.ok(Math.abs(manifest.verification.durationSec - 5) < 0.1);
  assert.equal(manifest.trimDecision.action, 'trim');
  assert.deepEqual(await fs.readFile(source), original);
  await page.screenshot({path: 'dist/qa-crate-export-beta9.png'});
  assert.deepEqual(errors, []);
  const security = await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(security.sandbox, true); assert.equal(security.contextIsolation, true); assert.equal(security.nodeIntegration, false);
  await page.locator('#closeDetailBtn').click();
  const scale = [];
  for (const count of [100, 500, 1000]) {
    await page.locator('#inputSource').fill(Array.from({length: count}, (_, i) => `Artist ${i} - Track ${i}`).join('\n'));
    const start = Date.now(); await page.locator('#analyzeBtn').click();
    await page.waitForFunction(expected => document.querySelectorAll('tr[data-index]').length === expected, count);
    const renderMs = Date.now() - start;
    const searchStart = Date.now(); await page.locator('#queueSearch').fill('Track 19');
    await page.waitForFunction(() => document.querySelector('#visibleCount').textContent.includes('shown'));
    scale.push({count, loadAndRenderMs: renderMs, searchMs: Date.now() - searchStart});
    await page.locator('#queueSearch').fill('');
  }
  console.log('Synthetic desktop queue timings:', JSON.stringify(scale));
  console.log('PASS Electron: local import -> inspection -> working audio preview -> close/restore review -> approved trim -> verified output -> M3U8, original preserved, sandbox enabled, no renderer errors');
} finally {
  await application?.close();
  await fs.rm(root, {recursive: true, force: true});
}
