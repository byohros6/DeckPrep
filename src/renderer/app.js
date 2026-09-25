const byId = id => document.getElementById(id);
const binaryStatusEl = byId('binaryStatus');
const inputSource = byId('inputSource');
const analyzeBtn = byId('analyzeBtn');
const rightsConfirmed = byId('rightsConfirmed');
const destPathInput = byId('destPath');
const browseBtn = byId('browseBtn');
const crateModeSelect = byId('crateMode');
const concurrencyRange = byId('concurrencyRange');
const concurrencyVal = byId('concurrencyVal');
const trackCountEl = byId('trackCount');
const collectionTitleEl = byId('collectionTitle');
const trackTableBody = byId('trackTableBody');
const logConsole = byId('logConsole');
const globalProgressBar = byId('globalProgressBar');
const progressStats = byId('progressStats');
const percentText = byId('percentText');
const openFolderBtn = byId('openFolderBtn');
const cancelBtn = byId('cancelBtn');
const startBtn = byId('startBtn');

let loadedTracks = [];
let destinationDir = '';
let isDownloading = false;

function appendLog(message, className = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${className}`;
  entry.textContent = message;
  logConsole.appendChild(entry);
  logConsole.scrollTop = logConsole.scrollHeight;
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDuration(value) {
  const seconds = Math.round(Number(value) || 0);
  if (!seconds) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function validateStartReady() {
  startBtn.disabled = isDownloading || !loadedTracks.length || !destinationDir || !rightsConfirmed.checked;
}

function updateProgress() {
  const finished = loadedTracks.filter(track => ['done', 'skipped', 'error', 'cancelled'].includes(track.status)).length;
  const percent = loadedTracks.length ? Math.round(finished * 100 / loadedTracks.length) : 0;
  globalProgressBar.style.width = `${percent}%`;
  progressStats.textContent = `${finished} / ${loadedTracks.length} completed`;
  percentText.textContent = `${percent}%`;
}

function renderTrackTable() {
  trackTableBody.innerHTML = loadedTracks.length ? loadedTracks.map(track => `
    <tr id="track-row-${track.index}">
      <td>${String(track.index).padStart(3, '0')}</td>
      <td>♪</td>
      <td><strong>${escapeHtml(track.title)}</strong></td>
      <td>${escapeHtml(track.artist)}</td>
      <td>${escapeHtml(track.mix || '—')}</td>
      <td>${formatDuration(track.durationSec)}</td>
      <td><span class="status-chip ${escapeHtml(track.status)}" id="status-chip-${track.index}">${escapeHtml(track.status)}</span></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="7">No tracks loaded.</td></tr>';
}

analyzeBtn.addEventListener('click', async () => {
  const rawInput = inputSource.value.trim();
  if (!rawInput) { appendLog('Paste a link or tracklist first.', 'err-msg'); return; }
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  try {
    const result = await window.djAPI.parseInput(rawInput);
    if (!result.success) throw new Error(result.error);
    loadedTracks = result.tracks.map((track, index) => ({ ...track, index: index + 1, status: 'pending' }));
    trackCountEl.textContent = loadedTracks.length;
    collectionTitleEl.textContent = `${result.title} (${result.source})`;
    rightsConfirmed.checked = false;
    renderTrackTable();
    updateProgress();
    validateStartReady();
    appendLog(`Loaded ${loadedTracks.length} tracks from ${result.source}.`, 'sys-msg');
  } catch (err) {
    loadedTracks = [];
    renderTrackTable();
    trackCountEl.textContent = '0';
    validateStartReady();
    appendLog(`Analysis failed: ${err.message}`, 'err-msg');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze & Load';
  }
});

rightsConfirmed.addEventListener('change', validateStartReady);
browseBtn.addEventListener('click', async () => {
  try {
    const folder = await window.djAPI.selectFolder();
    if (!folder) return;
    destinationDir = folder;
    destPathInput.value = folder;
    openFolderBtn.disabled = false;
    validateStartReady();
  } catch (err) { appendLog(`Could not choose destination: ${err.message}`, 'err-msg'); }
});
openFolderBtn.addEventListener('click', () => window.djAPI.openFolder(destinationDir));
byId('clearLogBtn').addEventListener('click', () => { logConsole.textContent = ''; });
concurrencyRange.addEventListener('input', () => { concurrencyVal.textContent = concurrencyRange.value; });

startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  isDownloading = true;
  analyzeBtn.disabled = true;
  cancelBtn.disabled = false;
  loadedTracks.forEach(track => { track.status = 'pending'; });
  renderTrackTable();
  updateProgress();
  validateStartReady();
  try {
    const result = await window.djAPI.startDownload({
      destinationDir, authorized: rightsConfirmed.checked,
      concurrency: Number(concurrencyRange.value), mode: crateModeSelect.value
    });
    if (!result.success) throw new Error(result.error);
  } catch (err) {
    appendLog(`Could not start: ${err.message}`, 'err-msg');
    isDownloading = false;
    analyzeBtn.disabled = false;
    cancelBtn.disabled = true;
    validateStartReady();
  }
});

cancelBtn.addEventListener('click', async () => {
  cancelBtn.disabled = true;
  await window.djAPI.cancelDownload();
});

function updateTrack(track) {
  const item = loadedTracks.find(entry => entry.index === track.index);
  if (item) item.status = track.status;
  const chip = byId(`status-chip-${track.index}`);
  if (chip) { chip.className = `status-chip ${track.status}`; chip.textContent = track.status; }
  updateProgress();
}
window.djAPI.onTrackProgress(updateTrack);
window.djAPI.onTrackCompleted(updateTrack);
window.djAPI.onLog(message => appendLog(message));
window.djAPI.onBatchCompleted(summary => {
  isDownloading = false;
  analyzeBtn.disabled = false;
  cancelBtn.disabled = true;
  validateStartReady();
  appendLog(summary.cancelled ? 'Batch cancelled.' : `Finished: ${summary.completed} downloaded, ${summary.skipped} skipped, ${summary.errors} errors. Destination folder opened.`, 'done-msg');
});

(async () => {
  try {
    byId('appVersion').textContent = `v${await window.djAPI.getAppVersion()}`;
    const status = await window.djAPI.checkBinaries();
    const ready = status.ffmpeg?.found && status.ytDlp?.found;
    binaryStatusEl.textContent = ready ? 'Engines Ready' : 'Engines Missing';
    binaryStatusEl.className = `status-badge ${ready ? 'ready' : 'missing'}`;
    const info = await window.djAPI.getSystemInfo();
    const workers = Math.max(1, info.defaultConcurrency || 2);
    concurrencyRange.max = String(Math.max(32, workers));
    concurrencyRange.value = String(workers);
    concurrencyVal.textContent = String(workers);
  } catch (err) {
    binaryStatusEl.textContent = 'Engine Error';
    binaryStatusEl.className = 'status-badge missing';
    appendLog(err.message, 'err-msg');
  }
})();
