import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  const isSmokeTest = process.argv.includes('--smoke-test');
  const captureArg = process.argv.find(arg => arg.startsWith('--capture-ui='));

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

app.whenReady().then(createWindow);

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
