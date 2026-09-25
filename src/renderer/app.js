const byId = id => document.getElementById(id);
const binaryStatusEl = byId('binaryStatus');
const inputSource = byId('inputSource');
const analyzeBtn = byId('analyzeBtn');
const destPathInput = byId('destPath');
const browseBtn = byId('browseBtn');
const crateModeSelect = byId('crateMode');
const concurrencyRange = byId('concurrencyRange');
const concurrencyVal = byId('concurrencyVal');
const trackCountEl = byId('trackCount');
const collectionTitleEl = byId('collectionTitle');
const trackTableBody = byId('trackTableBody');
const logConsole = byId('logConsole');
const activityPanel = byId('activityPanel');
const activityCount = byId('activityCount');
const globalProgressBar = byId('globalProgressBar');
const progressStats = byId('progressStats');
const percentText = byId('percentText');
const openFolderBtn = byId('openFolderBtn');
const cancelBtn = byId('cancelBtn');
const startBtn = byId('startBtn');

let loadedTracks = [];
let destinationDir = '';
let isDownloading = false;
let logCount = 0;

function appendLog(message, className = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${className}`;
  entry.textContent = message;
  logConsole.appendChild(entry);
  logConsole.scrollTop = logConsole.scrollHeight;
  activityCount.textContent = String(++logCount);
  if (className === 'err-msg') activityPanel.open = true;
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
  startBtn.disabled = isDownloading || !loadedTracks.length || !destinationDir;
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
      <td class="track-name" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</td>
      <td>${escapeHtml(track.artist)}</td>
      <td>${escapeHtml(track.mix || '—')}</td>
      <td>${formatDuration(track.durationSec)}</td>
      <td><span class="status-chip ${escapeHtml(track.status)}" id="status-chip-${track.index}">${escapeHtml(track.status)}</span></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="6"><div class="empty-state"><strong>Nothing in the queue</strong><span>Paste links or a tracklist on the left, then load tracks.</span></div></td></tr>';
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
    analyzeBtn.innerHTML = 'Load tracks <span aria-hidden="true">→</span>';
  }
});

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
byId('clearLogBtn').addEventListener('click', () => { logConsole.textContent = ''; logCount = 0; activityCount.textContent = '0'; });
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
      destinationDir,
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
    binaryStatusEl.textContent = ready ? 'Tools ready' : 'Tools missing';
    binaryStatusEl.className = `engine-status ${ready ? 'ready' : 'missing'}`;
    const info = await window.djAPI.getSystemInfo();
    const workers = Math.max(1, info.defaultConcurrency || 2);
    concurrencyRange.max = String(Math.max(32, workers));
    concurrencyRange.value = String(workers);
    concurrencyVal.textContent = String(workers);
  } catch (err) {
    binaryStatusEl.textContent = 'Tool error';
    binaryStatusEl.className = 'engine-status missing';
    appendLog(err.message, 'err-msg');
  }
})();
