const byId = id => document.getElementById(id);
const inputSource = byId('inputSource');
const analyzeBtn = byId('analyzeBtn');
const trackTableBody = byId('trackTableBody');
const selectAll = byId('selectAll');
const metadataBar = byId('metadataBar');
const fetchDetailsBtn = byId('fetchDetailsBtn');
const cancelDetailsBtn = byId('cancelDetailsBtn');
const startBtn = byId('startBtn');
const cancelBtn = byId('cancelBtn');
const logConsole = byId('logConsole');

let loadedTracks = [];
let destinationDir = '';
let isDownloading = false;
let isFetchingDetails = false;
let isLoadingInput = false;
let metadataProgress = { completed: 0, total: 0 };
let logCount = 0;

function appendLog(message, className = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${className}`;
  entry.textContent = message;
  logConsole.appendChild(entry);
  logConsole.scrollTop = logConsole.scrollHeight;
  byId('activityCount').textContent = String(++logCount);
  if (className === 'err-msg') byId('activityPanel').open = true;
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDuration(value) {
  const seconds = Math.round(Number(value) || 0);
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
}

function selectedTracks() { return loadedTracks.filter(track => track.selected); }
function detailsNeeded() { return selectedTracks().filter(track => track.needsMetadata); }

function displayStatus(track) {
  if (!track.selected && !isDownloading) return 'Excluded';
  if (track.metadataError) return 'Details failed';
  if (track.needsMetadata) return 'Details needed';
  return track.status === 'pending' ? 'Ready' : track.status;
}

function statusClass(track) {
  if (!track.selected && !isDownloading) return 'excluded';
  if (track.metadataError) return 'error';
  if (track.needsMetadata) return 'needs-details';
  return track.status;
}

function updateRow(track) {
  const row = byId(`track-row-${track.index}`);
  if (!row) return;
  row.classList.toggle('excluded', !track.selected);
  row.cells[2].textContent = track.title;
  row.cells[2].title = track.title;
  row.cells[3].textContent = track.artist;
  row.cells[4].textContent = track.mix || '—';
  row.cells[5].textContent = formatDuration(track.durationSec);
  const chip = row.cells[6].firstElementChild;
  chip.className = `status-chip ${statusClass(track)}`;
  chip.textContent = displayStatus(track);
  chip.title = track.metadataError || '';
}

function renderTrackTable() {
  trackTableBody.innerHTML = loadedTracks.length ? loadedTracks.map(track => `
    <tr id="track-row-${track.index}" class="${track.selected ? '' : 'excluded'}">
      <td><input class="track-select" type="checkbox" data-index="${track.index}" aria-label="Select track ${track.index}" ${track.selected ? 'checked' : ''} ${isDownloading || isFetchingDetails || isLoadingInput ? 'disabled' : ''}></td>
      <td>${String(track.index).padStart(3, '0')}</td>
      <td class="track-name" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</td>
      <td>${escapeHtml(track.artist)}</td>
      <td>${escapeHtml(track.mix || '—')}</td>
      <td>${formatDuration(track.durationSec)}</td>
      <td><span class="status-chip ${statusClass(track)}" title="${escapeHtml(track.metadataError || '')}">${escapeHtml(displayStatus(track))}</span></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="7"><div class="empty-state"><strong>Nothing in the queue</strong><span>Paste links or a tracklist on the left, then load tracks.</span></div></td></tr>';
}

function updateMetadataBar() {
  const needed = detailsNeeded();
  const failed = needed.filter(track => track.metadataError).length;
  metadataBar.hidden = !needed.length && !isFetchingDetails;
  if (isFetchingDetails) {
    byId('metadataHeadline').textContent = `Fetching details ${metadataProgress.completed} / ${metadataProgress.total}`;
    byId('metadataMessage').textContent = 'Titles, artists, and durations only. No audio is being downloaded.';
  } else {
    byId('metadataHeadline').textContent = `${needed.length} selected ${needed.length === 1 ? 'track needs' : 'tracks need'} details`;
    byId('metadataMessage').textContent = failed
      ? `${failed} could not be read. Retry, or uncheck those tracks to continue.`
      : 'Fetch titles, artists, and durations only. No audio downloads until you review and choose tracks.';
  }
  fetchDetailsBtn.hidden = isFetchingDetails;
  fetchDetailsBtn.disabled = isLoadingInput;
  fetchDetailsBtn.textContent = failed ? 'Retry details' : 'Fetch details';
  cancelDetailsBtn.hidden = !isFetchingDetails;
}

function updateProgress() {
  const selected = selectedTracks();
  const finished = selected.filter(track => ['done', 'skipped', 'error', 'cancelled'].includes(track.status)).length;
  const current = isFetchingDetails ? metadataProgress.completed : finished;
  const total = isFetchingDetails ? metadataProgress.total : selected.length;
  const percent = total ? Math.round(current * 100 / total) : 0;
  byId('globalProgressBar').style.width = `${percent}%`;
  byId('progressStats').textContent = isFetchingDetails ? `${current} / ${total} details fetched` : `${finished} / ${total} completed`;
  byId('percentText').textContent = `${percent}%`;
}

function updateControls() {
  const selected = selectedTracks();
  const needed = detailsNeeded();
  byId('selectedCount').textContent = `${selected.length} selected`;
  selectAll.disabled = !loadedTracks.length || isDownloading || isFetchingDetails || isLoadingInput;
  selectAll.checked = !!loadedTracks.length && selected.length === loadedTracks.length;
  selectAll.indeterminate = selected.length > 0 && selected.length < loadedTracks.length;
  startBtn.disabled = isLoadingInput || isDownloading || isFetchingDetails || !selected.length || !!needed.length || !destinationDir;
  startBtn.title = needed.length ? 'Fetch details for selected tracks first' : !destinationDir ? 'Choose a destination folder' : '';
  updateMetadataBar();
  updateProgress();
}

analyzeBtn.addEventListener('click', async () => {
  const rawInput = inputSource.value.trim();
  if (!rawInput) { appendLog('Paste a link or tracklist first.', 'err-msg'); return; }
  analyzeBtn.disabled = true;
  isLoadingInput = true;
  renderTrackTable();
  updateControls();
  analyzeBtn.textContent = 'Loading tracks...';
  try {
    const result = await window.djAPI.parseInput(rawInput);
    if (!result.success) throw new Error(result.error);
    loadedTracks = result.tracks.map((track, index) => ({ ...track, index: index + 1, selected: true, status: 'pending' }));
    byId('trackCount').textContent = loadedTracks.length;
    byId('collectionTitle').textContent = result.title;
    renderTrackTable();
    updateControls();
    appendLog(`Loaded ${loadedTracks.length} tracks from ${result.source}.`, 'sys-msg');
  } catch (err) {
    appendLog(`Could not load tracks: ${err.message}`, 'err-msg');
  } finally {
    isLoadingInput = false;
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Load tracks <span aria-hidden="true">→</span>';
    renderTrackTable();
    updateControls();
  }
});

trackTableBody.addEventListener('change', event => {
  if (!event.target.matches('.track-select')) return;
  const track = loadedTracks.find(item => item.index === Number(event.target.dataset.index));
  if (!track || isDownloading || isFetchingDetails) return;
  track.selected = event.target.checked;
  updateRow(track);
  updateControls();
});

selectAll.addEventListener('change', () => {
  loadedTracks.forEach(track => { track.selected = selectAll.checked; });
  renderTrackTable();
  updateControls();
});

fetchDetailsBtn.addEventListener('click', async () => {
  const indices = detailsNeeded().map(track => track.index);
  if (!indices.length) return;
  isFetchingDetails = true;
  metadataProgress = { completed: 0, total: indices.length };
  analyzeBtn.disabled = true;
  renderTrackTable();
  updateControls();
  try {
    const result = await window.djAPI.fetchMetadata(indices);
    if (!result.success) throw new Error(result.error);
  } catch (err) {
    isFetchingDetails = false;
    analyzeBtn.disabled = false;
    renderTrackTable();
    updateControls();
    appendLog(`Could not fetch details: ${err.message}`, 'err-msg');
  }
});

cancelDetailsBtn.addEventListener('click', async () => {
  cancelDetailsBtn.disabled = true;
  await window.djAPI.cancelMetadata();
});

window.djAPI.onMetadataProgress(({ track, completed, total }) => {
  const item = loadedTracks.find(entry => entry.index === track.index);
  if (item) {
    Object.assign(item, track);
    updateRow(item);
  }
  metadataProgress = { completed, total };
  updateControls();
});

window.djAPI.onMetadataCompleted(summary => {
  isFetchingDetails = false;
  analyzeBtn.disabled = false;
  cancelDetailsBtn.disabled = false;
  renderTrackTable();
  updateControls();
  appendLog(summary.cancelled
    ? `Details lookup stopped after ${summary.completed} tracks.`
    : `Details ready for ${summary.completed - summary.errors} tracks; ${summary.errors} unavailable.`,
  summary.errors ? 'err-msg' : 'done-msg');
});

byId('browseBtn').addEventListener('click', async () => {
  try {
    const folder = await window.djAPI.selectFolder();
    if (!folder) return;
    destinationDir = folder;
    byId('destPath').value = folder;
    byId('openFolderBtn').disabled = false;
    updateControls();
  } catch (err) { appendLog(`Could not choose destination: ${err.message}`, 'err-msg'); }
});
byId('openFolderBtn').addEventListener('click', () => window.djAPI.openFolder(destinationDir));
byId('clearLogBtn').addEventListener('click', () => { logConsole.textContent = ''; logCount = 0; byId('activityCount').textContent = '0'; });
byId('concurrencyRange').addEventListener('input', event => { byId('concurrencyVal').textContent = event.target.value; });

startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  isDownloading = true;
  analyzeBtn.disabled = true;
  cancelBtn.disabled = false;
  selectedTracks().forEach(track => { track.status = 'pending'; });
  renderTrackTable();
  updateControls();
  try {
    const result = await window.djAPI.startDownload({
      destinationDir, selectedIndices: selectedTracks().map(track => track.index),
      concurrency: Number(byId('concurrencyRange').value), mode: byId('crateMode').value
    });
    if (!result.success) throw new Error(result.error);
  } catch (err) {
    appendLog(`Could not start: ${err.message}`, 'err-msg');
    isDownloading = false;
    analyzeBtn.disabled = false;
    cancelBtn.disabled = true;
    renderTrackTable();
    updateControls();
  }
});

cancelBtn.addEventListener('click', async () => {
  cancelBtn.disabled = true;
  await window.djAPI.cancelDownload();
});

function updateTrack(track) {
  const item = loadedTracks.find(entry => entry.index === track.index);
  if (item) { Object.assign(item, track); updateRow(item); }
  updateProgress();
}
window.djAPI.onTrackProgress(updateTrack);
window.djAPI.onTrackCompleted(updateTrack);
window.djAPI.onLog(message => appendLog(message));
window.djAPI.onBatchCompleted(summary => {
  isDownloading = false;
  analyzeBtn.disabled = false;
  cancelBtn.disabled = true;
  renderTrackTable();
  updateControls();
  appendLog(summary.cancelled ? 'Batch cancelled.' : `Finished: ${summary.completed} downloaded, ${summary.skipped} skipped, ${summary.errors} errors.`, 'done-msg');
});

(async () => {
  try {
    byId('appVersion').textContent = `v${await window.djAPI.getAppVersion()}`;
    const status = await window.djAPI.checkBinaries();
    const ready = status.ffmpeg?.found && status.ytDlp?.found;
    byId('binaryStatus').textContent = ready ? 'Tools ready' : 'Tools missing';
    byId('binaryStatus').className = `engine-status ${ready ? 'ready' : 'missing'}`;
    const info = await window.djAPI.getSystemInfo();
    const workers = Math.max(1, info.defaultConcurrency || 2);
    byId('concurrencyRange').max = String(Math.max(32, workers));
    byId('concurrencyRange').value = String(workers);
    byId('concurrencyVal').textContent = String(workers);
  } catch (err) {
    byId('binaryStatus').textContent = 'Tool error';
    byId('binaryStatus').className = 'engine-status missing';
    appendLog(err.message, 'err-msg');
  }
})();
