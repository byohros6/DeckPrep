import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';
import { resolveBinary } from './engine/binaryManager.js';
import { DownloadQueue } from './engine/downloadQueue.js';

const execFileAsync = promisify(execFile);

async function checkPackagedExport(ffmpeg) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deckprep-packaged-check-'));
  const source = path.join(directory, 'source.mp3');
  const destination = path.join(directory, 'output');
  let server;
  try {
    fs.mkdirSync(destination);
    await execFileAsync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', source], { timeout: 10000 });
    server = http.createServer((_, response) => {
      response.writeHead(200, { 'content-type': 'audio/mpeg' });
      fs.createReadStream(source).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const summary = await new Promise(resolve => {
      const queue = new DownloadQueue({ destinationDir: destination, concurrency: 1, onAllCompleted: resolve });
      queue.load([{ index: 1, artist: 'DeckPrep', title: 'Package check', directUrl: `http://127.0.0.1:${server.address().port}/source.mp3` }]);
      queue.start();
    });
    if (summary.completed !== 1 || summary.errors) throw new Error('The packaged app could not complete an audio export');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDataArg = process.argv.find(arg => arg.startsWith('--test-user-data='));
if (testDataArg) {
  const directory = testDataArg.slice('--test-user-data='.length);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}

let mainWindow = null;

function createWindow() {
  const isSmokeTest = process.argv.includes('--smoke-test');
  const captureArg = process.argv.find(arg => arg.startsWith('--capture-ui='));
  const captureSourceArg = process.argv.find(arg => arg.startsWith('--capture-source='));
  const captureDetailsArg = process.argv.find(arg => arg.startsWith('--capture-details='));
  const captureRestore = process.argv.includes('--capture-restore');
  const captureMatch = process.argv.includes('--capture-match');
  const captureChooseMatch = process.argv.includes('--capture-choose-match');
  const captureCancelMatch = process.argv.includes('--capture-cancel-match');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    show: !isSmokeTest,
    backgroundColor: '#0d1117',
    title: 'DeckPrep',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1b1d20', symbolColor: '#e6e8eb', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  registerIpcHandlers(mainWindow);
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  if (captureArg) {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 900));
        if (captureRestore) {
          await mainWindow.webContents.executeJavaScript("document.getElementById('resumeSessionBtn').click()");
          for (let attempt = 0; attempt < 30; attempt++) {
            const count = await mainWindow.webContents.executeJavaScript("Number(document.getElementById('trackCount').textContent)");
            if (count > 0) break;
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        if (captureSourceArg) {
          const source = captureSourceArg.slice('--capture-source='.length);
          await mainWindow.webContents.executeJavaScript(`document.getElementById('inputSource').value = ${JSON.stringify(source)}; document.getElementById('analyzeBtn').click();`);
          for (let attempt = 0; attempt < 150; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const count = await mainWindow.webContents.executeJavaScript("Number(document.getElementById('trackCount').textContent)");
            const errors = await mainWindow.webContents.executeJavaScript("Number(document.getElementById('activityCount').textContent)");
            if (count > 0 || errors > 0) break;
          }
          if (captureDetailsArg) {
            const selected = Math.max(1, Number(captureDetailsArg.slice('--capture-details='.length)) || 1);
            for (let attempt = 0; attempt < 150; attempt++) {
              const busy = await mainWindow.webContents.executeJavaScript("!document.getElementById('cancelDetailsBtn').hidden");
              if (!busy) break;
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            await mainWindow.webContents.executeJavaScript(`document.getElementById('selectAll').click(); [...document.querySelectorAll('.track-select')].slice(0, ${selected}).forEach(input => input.click()); if (!document.getElementById('metadataBar').hidden) document.getElementById('fetchDetailsBtn').click();`);
            for (let attempt = 0; attempt < 150; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 300));
              const done = await mainWindow.webContents.executeJavaScript("document.getElementById('metadataBar').hidden && Number(document.getElementById('activityCount').textContent) > 1");
              if (done) break;
            }
          }
          if (captureMatch) {
            await mainWindow.webContents.executeJavaScript("document.getElementById('selectAll').click(); document.querySelector('.track-select').click(); document.getElementById('findMatchesBtn').click()");
            for (let attempt = 0; attempt < 150; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 300));
              const done = await mainWindow.webContents.executeJavaScript("document.getElementById('cancelMatchesBtn').hidden && Number(document.getElementById('activityCount').textContent) > 1");
              if (done) break;
            }
            await mainWindow.webContents.executeJavaScript("document.querySelector('tr[data-index]').click()");
            if (captureChooseMatch) {
              await mainWindow.webContents.executeJavaScript("document.querySelector('.candidate').click()");
              await new Promise(resolve => setTimeout(resolve, 600));
            }
          }
          if (captureCancelMatch) {
            await mainWindow.webContents.executeJavaScript("document.getElementById('findMatchesBtn').click()");
            await new Promise(resolve => setTimeout(resolve, 350));
            await mainWindow.webContents.executeJavaScript("document.getElementById('cancelMatchesBtn').click()");
            for (let attempt = 0; attempt < 30; attempt++) {
              const done = await mainWindow.webContents.executeJavaScript("document.getElementById('cancelMatchesBtn').hidden");
              if (done) break;
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          await new Promise(resolve => setTimeout(resolve, 400));
        }
        const fs = await import('node:fs/promises');
        const image = await mainWindow.webContents.capturePage();
        await fs.writeFile(captureArg.slice('--capture-ui='.length), image.toPNG());
        app.exit(0);
      } catch (err) {
        console.error(err);
        app.exit(1);
      }
    });
  }

  if (isSmokeTest) {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        // Let the renderer finish its engine and worker checks.
        await new Promise(r => setTimeout(r, 1200));

        const testResults = await mainWindow.webContents.executeJavaScript(`
          (() => {
            const hasDjAPI = typeof window.djAPI !== 'undefined';
            const binaryStatus = document.getElementById('binaryStatus')?.textContent;
            const concurrencyVal = document.getElementById('concurrencyVal')?.textContent;
            const concurrencyRangeVal = document.getElementById('concurrencyRange')?.value;
            const destPath = document.getElementById('destPath');
            return {
              hasDjAPI,
              binaryStatus,
              concurrencyVal,
              concurrencyRangeVal,
              hasDestInput: !!destPath,
              hasLinkInput: !!document.getElementById('inputSource')
            };
          })()
        `);

        console.log('SMOKE_TEST_RESULT:', JSON.stringify(testResults));
        app.exit(0);
      } catch (err) {
        console.error('SMOKE_TEST_ERROR:', err);
        app.exit(1);
      }
    });

    setTimeout(() => {
      console.error('SMOKE_TEST_TIMEOUT');
      app.exit(2);
    }, 15000);
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const engineCheckArg = process.argv.find(arg => arg.startsWith('--check-engines='));
  if (!engineCheckArg) return createWindow();
  const resultPath = engineCheckArg.slice('--check-engines='.length);
  try {
    const ffmpeg = await resolveBinary('ffmpeg');
    const ytDlp = await resolveBinary('yt-dlp');
    if (!ffmpeg || !ytDlp) throw new Error('A bundled engine is missing');
    await execFileAsync(ffmpeg, ['-version'], { timeout: 10000 });
    await execFileAsync(ytDlp, ['--version'], { timeout: 10000 });
    await checkPackagedExport(ffmpeg);
    fs.writeFileSync(resultPath, JSON.stringify({ success: true, ffmpeg, ytDlp, export: true }));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync(resultPath, JSON.stringify({ success: false, error: error.message }));
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
