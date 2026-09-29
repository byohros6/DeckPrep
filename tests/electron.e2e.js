import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveBinary } from '../src/main/engine/binaryManager.js';
import { rankCandidates } from '../src/main/engine/matching.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deckprep-e2e-'));
const source = path.join(root, 'עומר - Test song.wav');
const destination = path.join(root, 'crate');
await fs.mkdir(destination);
const ffmpeg = await resolveBinary('ffmpeg');
await promisify(execFile)(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-af', 'apad=pad_dur=15', source]);
const original = await fs.readFile(source);
let mediaServer;
mediaServer = http.createServer((_request, response) => {
  response.writeHead(200, {'content-type': 'audio/wav', 'content-length': original.length});
  response.end(original);
});
await new Promise(resolve => mediaServer.listen(0, '127.0.0.1', resolve));
const directUrl = `http://127.0.0.1:${mediaServer.address().port}/source.wav`;
await fs.mkdir(path.join(root, 'state'), {recursive: true});
await fs.writeFile(path.join(root, 'state', 'session.json'), JSON.stringify({
  version: 2, source: 'youtube', phase: 'review', collection: {title: 'Generated link'},
  tracks: [{id: 'generated-link', index: 1, artist: 'Generated', title: 'Test song',
    directUrl, selected: true, status: 'pending'}]
}));
const oldReview = path.join(root, 'state', 'audio-cache', 'audio-orphan');
await fs.mkdir(oldReview, {recursive: true});
await fs.writeFile(path.join(oldReview, 'source.mp3'), 'generated orphan fixture');
const oldTime = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
await fs.utimes(oldReview, oldTime, oldTime);
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
  await assert.rejects(fs.stat(oldReview), {code: 'ENOENT'}, 'startup should remove an old unreferenced review source');
  let maximized = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    maximized = await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isMaximized());
    if (maximized) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(maximized, true, 'the main window should open maximized');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  assert.equal(await page.locator('#localFilesBtn').count(), 0);
  assert.equal(await page.locator('#exportCrateBtn').count(), 0);
  assert.deepEqual(await page.evaluate(() => [typeof window.djAPI.importLocal, typeof window.djAPI.exportCrate]), ['undefined', 'undefined']);
  await page.locator('#resumeSessionBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('tr[data-index]').length === 1);
  await page.locator('#browseBtn').click();
  assert.match(await page.locator('#startBtn').innerText(), /Download selected/);
  assert.equal(await page.locator('.support-menu').evaluate(element => element.open), false);
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => document.querySelector('.status-chip')?.textContent === 'Review ending');
  await page.waitForFunction(() => document.querySelector('#cancelBtn').disabled);
  await page.locator('tr[data-index]').click();
  await page.waitForFunction(() => document.querySelector('audio')?.duration > 17);
  await fs.mkdir('dist', {recursive: true});
  await page.screenshot({path: 'dist/qa-audio-review-beta11.png'});
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
  const files = await fs.readdir(destination);
  assert.ok(files.some(file => file.endsWith('.mp3')));
  assert.ok(!files.some(file => file.endsWith('.m3u8')));
  const manifest = JSON.parse(await fs.readFile(path.join(destination, files.find(file => file.endsWith('.mp3.deckprep.json'))), 'utf8'));
  assert.ok(Math.abs(manifest.verification.durationSec - 5) < 0.1);
  assert.equal(manifest.trimDecision.action, 'trim');
  assert.deepEqual(await fs.readFile(source), original);
  await page.screenshot({path: 'dist/qa-download-complete-beta11.png'});
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
  await application.close();
  application = null;
  const wrongUrl = 'https://www.youtube.com/watch?v=wrong-version';
  const requested = {id: 'test-version-conflict', artist: 'Kerri Chandler, Troy Denari', title: 'The Way It Goes', mix: 'Chris Stassy Remix', durationSec: 488, source: 'spotify', selected: true, status: 'pending'};
  const wrong = {url: wrongUrl, title: 'Kerri Chandler feat. Troy Denari - The Way It Goes (Original Mix, Long Club Version)', artist: 'Kerri Chandler', durationSec: 488, provider: 'YouTube'};
  const candidates = rankCandidates(requested, [wrong]).candidates;
  assert.equal(candidates[0].evidence.versionCompatible, false);
  const exportedAudio = path.join(destination, files.find(file => file.endsWith('.mp3')));
  const completed = Array.from({length: 30}, (_, index) => ({id: `verified-${index}`, artist: 'Generated', title: `Verified ${index}`, selected: false, status: 'done', outputPath: exportedAudio}));
  await fs.writeFile(path.join(root, 'state', 'session.json'), JSON.stringify({version: 2, source: 'spotify', collection: {title: 'Version review'}, tracks: [{...requested, candidates, matchUrl: wrongUrl, matchState: 'chosen'}, ...completed]}));
  application = await electron.launch({...(executable ? {executablePath: executable} : {}), args: [...(executable ? [] : ['.']), '--test-user-data=' + path.join(root, 'state')], timeout: 30000});
  page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#resumeSessionBtn').click();
  const competingImport = await page.evaluate(() => window.djAPI.parseInput('Artist - Competing track'));
  assert.equal(competingImport.success, false, 'import should wait for restore validation');
  const competingDownload = await page.evaluate(options => window.djAPI.startDownload(options), {destinationDir: destination, selectedIndices: [1], concurrency: 1, mode: 'flat'});
  assert.equal(competingDownload.success, false, 'download should wait for restore validation');
  await page.locator('#cancelRestoreBtn').click();
  await page.waitForFunction(() => !document.getElementById('resumeSessionBtn').disabled);
  assert.equal(await page.locator('#restoreDialog').isVisible(), true, 'cancelled restore keeps the saved queue available');
  await page.locator('#resumeSessionBtn').click();
  await page.locator('tr[data-index]').first().click();
  const conflictingChoice = page.locator('.candidate').first();
  assert.match(await conflictingChoice.innerText(), /Original Mix, Long Club Version/);
  assert.equal(await conflictingChoice.isDisabled(), true);
  assert.match(await conflictingChoice.innerText(), /Wrong version/);
  assert.match(await conflictingChoice.innerText(), /conflicts with the requested Chris Stassy Remix/);
  assert.equal(await conflictingChoice.evaluate(element => getComputedStyle(element).opacity), '1');
  assert.equal(await conflictingChoice.locator('strong').evaluate(element => getComputedStyle(element).whiteSpace), 'normal');
  assert.match(await page.locator('#detailHelp').innerText(), /conflicts with the requested version/);
  const manualChoice = await page.evaluate(url => window.djAPI.chooseMatch(1, url), wrongUrl);
  assert.equal(manualChoice.success, false);
  assert.match(manualChoice.error, /conflicts with the requested version/);
  await page.screenshot({path: 'dist/qa-match-review-beta11.png'});
  const restoreDuringClose = page.evaluate(() => window.djAPI.restoreSession()).catch(() => null);
  const blockedWhileClosing = await page.evaluate(() => window.djAPI.parseInput('Artist - Blocked while restoring'));
  assert.equal(blockedWhileClosing.success, false);
  const closed = application.waitForEvent('close', {timeout: 6000});
  await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  await restoreDuringClose;
  application = null;
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'state', 'session.json'), 'utf8')).tracks.length, 31);
  assert.deepEqual(errors, []);
  console.log('Synthetic desktop queue timings:', JSON.stringify(scale));
  console.log('PASS Electron: generated link -> download -> inspection -> preview -> restore -> approved trim -> verified MP3, source preserved; restore cancellation/operation exclusion, close-during-restore and incompatible match rejection verified; sandbox enabled, no renderer errors');
} finally {
  await application?.close();
  if (mediaServer) await new Promise(resolve => mediaServer.close(resolve));
  await fs.rm(root, {recursive: true, force: true});
}
