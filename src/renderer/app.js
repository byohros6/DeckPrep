const byId = id => document.getElementById(id);
const inputSource = byId('inputSource');
const analyzeBtn = byId('analyzeBtn');
const trackTableBody = byId('trackTableBody');
const selectAll = byId('selectAll');
const metadataBar = byId('metadataBar');
const fetchDetailsBtn = byId('fetchDetailsBtn');
const cancelDetailsBtn = byId('cancelDetailsBtn');
const matchingBar = byId('matchingBar');
const findMatchesBtn = byId('findMatchesBtn');
const cancelMatchesBtn = byId('cancelMatchesBtn');
const startBtn = byId('startBtn');
const cancelBtn = byId('cancelBtn');
const logConsole = byId('logConsole');

let loadedTracks = [];
let destinationDir = '';
let isDownloading = false;
let isFetchingDetails = false;
let isLoadingInput = false;
let isFindingMatches = false;
let collectionSource = '';
let collectionInfo = {};
let metadataProgress = { completed: 0, total: 0 };
let matchProgress = { completed: 0, total: 0 };
let activeDetailIndex = null;
let sessionSaveTimer = null;
let sessionPromptOpen = false;
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

function saveQueueSoon(delay = 400) {
  if (!loadedTracks.length || sessionPromptOpen) return;
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    const selected = selectedTracks();
    const complete = selected.length && selected.every(track => ['done', 'skipped'].includes(track.status));
    window.djAPI.saveSession({
      input: inputSource.value, source: collectionSource, collection: collectionInfo,
      tracks: loadedTracks, destinationDir, mode: byId('crateMode').value,
      concurrency: Number(byId('concurrencyRange').value),
      phase: isDownloading ? 'downloading' : complete ? 'completed' : 'review'
    }).catch(err => appendLog(`Could not save session: ${err.message}`, 'err-msg'));
  }, delay);
}

function showPlaylistCard(result) {
  const card = byId('playlistCard');
  const artwork = byId('playlistArtwork');
  card.hidden = !result.creator && !result.artworkUrl;
  byId('playlistName').textContent = result.title || '';
  byId('playlistName').title = result.title || '';
  byId('playlistCreator').textContent = result.creator ? `by ${result.creator}` : '';
  byId('playlistCreator').title = result.creator || '';
  byId('playlistOpenBtn').hidden = !result.sourceUrl;
  byId('playlistOpenBtn').dataset.url = result.sourceUrl || '';
  artwork.hidden = true;
  artwork.removeAttribute('src');
  try {
    const url = new URL(result.artworkUrl);
    if (url.protocol === 'https:' && (url.hostname.endsWith('.sndcdn.com') || url.hostname === 'i.scdn.co' || url.hostname.endsWith('.mzstatic.com') || url.hostname === 'i.ytimg.com')) {
      artwork.src = url.href;
      artwork.hidden = false;
    }
  } catch { /* No artwork is available. */ }
}

function collectionSubtitle(result) {
  if (!result.creator && !result.artworkUrl) return result.title || 'Track queue';
  if (result.source === 'soundcloud') return 'SoundCloud playlist · Length may be unavailable in quick details';
  if (result.source === 'youtube') return 'YouTube playlist · Original links';
  if (result.source === 'spotify' || result.source === 'apple') return `${result.source === 'spotify' ? 'Spotify' : 'Apple Music'} track list · Find audio before exporting`;
  return result.title || 'Track queue';
}

function showSourceWarning(message) {
  const warning = byId('sourceWarning');
  warning.hidden = !message;
  warning.textContent = message || '';
}

byId('playlistArtwork').addEventListener('error', event => { event.target.hidden = true; });
byId('playlistOpenBtn').addEventListener('click', () => window.djAPI.openSourceLink(byId('playlistOpenBtn').dataset.url));

function selectedTracks() { return loadedTracks.filter(track => track.selected); }
function pendingTracks() { return selectedTracks().filter(track => !['done', 'skipped'].includes(track.status)); }
function detailsNeeded() { return selectedTracks().filter(track => track.needsMetadata); }
function matchesNeeded() { return selectedTracks().filter(track => !track.needsMetadata && !track.directUrl && !track.matchUrl); }

function visibleTracks() {
  const query = byId('queueSearch').value.trim().toLowerCase();
  const filter = byId('queueFilter').value;
  return loadedTracks.filter(track => {
    if (query && !`${track.title} ${track.artist} ${track.mix || ''}`.toLowerCase().includes(query)) return false;
    if (filter === 'selected') return track.selected;
    if (filter === 'review') return track.needsMetadata || track.matchState === 'review' || (!track.directUrl && !track.matchUrl);
    if (filter === 'failed') return track.status === 'error' || !!track.metadataError || !!track.matchError;
    if (filter === 'done') return ['done', 'skipped'].includes(track.status);
    return true;
  });
}

function displayStatus(track) {
  if (!track.selected && !isDownloading) return 'Excluded';
  if (track.status === 'error') return 'Failed';
  if (track.status === 'done') return 'Downloaded';
  if (track.status === 'skipped') return 'Already exists';
  if (track.metadataError) return 'Details failed';
  if (track.needsMetadata) return 'Details needed';
  if (track.matchError) return 'Match failed';
  if (!track.directUrl && !track.matchUrl) return track.candidates?.length ? 'Review match' : 'Find match';
  return track.status === 'pending' ? 'Ready' : track.status;
}

function statusClass(track) {
  if (!track.selected && !isDownloading) return 'excluded';
  if (track.status === 'error') return 'error';
  if (track.metadataError) return 'error';
  if (track.needsMetadata) return 'needs-details';
  if (track.matchError) return 'error';
  if (!track.directUrl && !track.matchUrl) return 'needs-details';
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
  chip.title = track.errorMessage || track.metadataError || track.matchError || '';
  if (activeDetailIndex === track.index) renderDetail(track);
}

function renderTrackTable() {
  const visible = visibleTracks();
  byId('visibleCount').textContent = `${visible.length} shown`;
  trackTableBody.innerHTML = visible.length ? visible.map(track => `
    <tr id="track-row-${track.index}" data-index="${track.index}" tabindex="0" class="${track.selected ? '' : 'excluded'} ${activeDetailIndex === track.index ? 'active-row' : ''}">
      <td><input class="track-select" type="checkbox" data-index="${track.index}" aria-label="Select track ${track.index}" ${track.selected ? 'checked' : ''} ${isDownloading || isFetchingDetails || isFindingMatches || isLoadingInput ? 'disabled' : ''}></td>
      <td>${String(track.index).padStart(3, '0')}</td>
      <td class="track-name" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</td>
      <td>${escapeHtml(track.artist)}</td>
      <td>${escapeHtml(track.mix || '—')}</td>
      <td>${formatDuration(track.durationSec)}</td>
      <td><span class="status-chip ${statusClass(track)}" title="${escapeHtml(track.errorMessage || track.metadataError || track.matchError || '')}">${escapeHtml(displayStatus(track))}</span></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="7"><div class="empty-state"><strong>${loadedTracks.length ? 'No matching tracks' : 'Nothing in the queue'}</strong><span>${loadedTracks.length ? 'Change the search or filter to see more.' : 'Paste links or a tracklist on the left, then load tracks.'}</span></div></td></tr>`;
}

function updateMetadataBar() {
  const needed = detailsNeeded();
  const failed = needed.filter(track => track.metadataError).length;
  metadataBar.hidden = !needed.length && !isFetchingDetails;
  if (isFetchingDetails) {
    byId('metadataHeadline').textContent = `Fetching details ${metadataProgress.completed} / ${metadataProgress.total}`;
    byId('metadataMessage').textContent = collectionSource === 'soundcloud'
      ? 'Reading public SoundCloud titles and artwork. Length appears where available. No audio is downloading.'
      : 'Titles, artists, and durations only. No audio is being downloaded.';
  } else {
    byId('metadataHeadline').textContent = `${needed.length} selected ${needed.length === 1 ? 'track needs' : 'tracks need'} details`;
    byId('metadataMessage').textContent = failed
      ? `${failed} could not be read. Retry, or uncheck those tracks to continue.`
      : collectionSource === 'soundcloud'
        ? 'Fetch public track titles and artwork. Length may be unavailable; no audio downloads yet.'
        : 'Fetch titles, artists, and durations only. No audio downloads until you review and choose tracks.';
  }
  fetchDetailsBtn.hidden = isFetchingDetails;
  fetchDetailsBtn.disabled = isLoadingInput;
  fetchDetailsBtn.textContent = failed ? 'Retry details' : 'Fetch details';
  cancelDetailsBtn.hidden = !isFetchingDetails;
}

function updateMatchingBar() {
  const needed = matchesNeeded();
  matchingBar.hidden = !needed.length && !isFindingMatches;
  if (isFindingMatches) {
    byId('matchingHeadline').textContent = `Searching audio ${matchProgress.completed} / ${matchProgress.total}`;
    byId('matchingMessage').textContent = 'Comparing title, artist, version and available duration. Uncertain results need your review.';
  } else {
    const review = needed.filter(track => track.candidates?.length).length;
    byId('matchingHeadline').textContent = `${needed.length} selected ${needed.length === 1 ? 'track needs' : 'tracks need'} a match`;
    byId('matchingMessage').textContent = review
      ? `${review} ${review === 1 ? 'track has' : 'tracks have'} candidates to review. Click a track to choose its recording.`
      : 'Find recordings on SoundCloud and YouTube before downloading.';
  }
  findMatchesBtn.hidden = isFindingMatches;
  findMatchesBtn.disabled = isLoadingInput || isFetchingDetails;
  findMatchesBtn.textContent = needed.some(track => track.matchError || track.candidates?.length) ? 'Refresh results' : 'Find matches';
  cancelMatchesBtn.hidden = !isFindingMatches;
}

function updateProgress() {
  const selected = selectedTracks();
  const finished = selected.filter(track => ['done', 'skipped', 'error', 'cancelled'].includes(track.status)).length;
  const current = isFetchingDetails ? metadataProgress.completed : isFindingMatches ? matchProgress.completed : finished;
  const total = isFetchingDetails ? metadataProgress.total : isFindingMatches ? matchProgress.total : selected.length;
  const percent = total ? Math.round(current * 100 / total) : 0;
  byId('globalProgressBar').style.width = `${percent}%`;
  byId('progressStats').textContent = isFetchingDetails ? `${current} / ${total} details fetched`
    : isFindingMatches ? `${current} / ${total} matches checked` : `${finished} / ${total} completed`;
  byId('percentText').textContent = `${percent}%`;
}

function updateControls() {
  const selected = selectedTracks();
  const pending = pendingTracks();
  const needed = detailsNeeded();
  const unresolved = matchesNeeded();
  const visible = visibleTracks();
  byId('selectedCount').textContent = `${selected.length} selected`;
  selectAll.disabled = !visible.length || isDownloading || isFetchingDetails || isFindingMatches || isLoadingInput;
  selectAll.checked = !!visible.length && visible.every(track => track.selected);
  selectAll.indeterminate = visible.some(track => track.selected) && !selectAll.checked;
  byId('selectVisibleBtn').disabled = selectAll.disabled;
  byId('clearSelectionBtn').disabled = !selected.length || isDownloading || isFetchingDetails || isFindingMatches || isLoadingInput;
  startBtn.disabled = isLoadingInput || isDownloading || isFetchingDetails || isFindingMatches || !pending.length || !!needed.length || !!unresolved.length || !destinationDir;
  startBtn.title = needed.length ? 'Fetch details for selected tracks first' : unresolved.length ? 'Review selected audio matches first' : !destinationDir ? 'Choose a destination folder' : !pending.length ? 'All selected tracks are complete' : '';
  byId('retryFailedBtn').hidden = !loadedTracks.some(track => track.status === 'error') || isDownloading;
  updateMetadataBar();
  updateMatchingBar();
  updateProgress();
}

function renderDetail(track) {
  byId('detailPanel').hidden = false;
  byId('detailNumber').textContent = `TRACK ${String(track.index).padStart(3, '0')}`;
  byId('detailTitle').textContent = track.title;
  byId('detailArtist').textContent = track.artist;
  byId('openOriginalBtn').hidden = !(track.sourceUrl || track.directUrl);
  byId('detailMix').textContent = track.mix || '—';
  byId('detailDuration').textContent = formatDuration(track.durationSec);
  byId('detailSource').textContent = track.source === 'apple' ? 'Apple Music' : track.source === 'youtube' ? 'YouTube' : track.source === 'soundcloud' ? 'SoundCloud' : track.source === 'spotify' ? 'Spotify' : 'Tracklist';
  const help = track.errorMessage || track.metadataError || track.matchError;
  byId('detailHelp').textContent = help || (track.directUrl ? 'Uses the original audio link.'
    : track.matchUrl ? 'A recording has been selected.' : track.candidates?.length ? 'Choose the recording that matches this track.' : 'Find audio matches to see your options.');
  const list = byId('candidateList');
  list.replaceChildren();
  for (const candidate of track.candidates || []) {
    const row = document.createElement('div');
    row.className = 'candidate-row';
    const button = document.createElement('button');
    button.className = `candidate ${candidate.url === track.matchUrl ? 'chosen' : ''}`;
    button.type = 'button';
    button.setAttribute('aria-label', `Use ${candidate.title} from ${candidate.provider}`);
    const title = document.createElement('strong');
    title.textContent = candidate.title;
    const details = document.createElement('span');
    const quality = candidate.score >= 0.8 ? 'Likely' : candidate.score >= 0.55 ? 'Possible' : 'Weak';
    details.textContent = `${candidate.provider} · ${candidate.artist || 'Unknown artist'} · ${formatDuration(candidate.durationSec)} · ${quality} match`;
    button.append(title, details);
    button.addEventListener('click', async () => {
      const result = await window.djAPI.chooseMatch(track.index, candidate.url);
      if (!result.success) { appendLog(result.error, 'err-msg'); return; }
      Object.assign(track, result.track);
      renderDetail(track);
      updateRow(track);
      updateControls();
      saveQueueSoon();
    });
    const open = document.createElement('button');
    open.className = 'candidate-open';
    open.type = 'button';
    open.textContent = '↗';
    open.title = 'Open candidate in browser';
    open.setAttribute('aria-label', `Open ${candidate.title} in browser`);
    open.addEventListener('click', () => window.djAPI.openSourceLink(candidate.url));
    row.append(button, open);
    list.appendChild(row);
  }
  byId('retryTrackBtn').hidden = !track.errorMessage && !track.metadataError && !track.matchError;
  byId('retryTrackBtn').textContent = track.metadataError ? 'Retry details' : track.matchError ? 'Retry match search' : 'Select for retry';
}

function openDetail(index) {
  const track = loadedTracks.find(item => item.index === index);
  if (!track) return;
  activeDetailIndex = index;
  renderTrackTable();
  renderDetail(track);
}

byId('closeDetailBtn').addEventListener('click', () => {
  activeDetailIndex = null;
  byId('detailPanel').hidden = true;
  renderTrackTable();
});
byId('openOriginalBtn').addEventListener('click', () => {
  const track = loadedTracks.find(item => item.index === activeDetailIndex);
  if (track) window.djAPI.openSourceLink(track.sourceUrl || track.directUrl);
});
trackTableBody.addEventListener('click', event => {
  if (event.target.closest('input')) return;
  const row = event.target.closest('tr[data-index]');
  if (row) openDetail(Number(row.dataset.index));
});
trackTableBody.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-index]')) {
    event.preventDefault();
    openDetail(Number(event.target.dataset.index));
  }
});
byId('retryTrackBtn').addEventListener('click', () => {
  const track = loadedTracks.find(item => item.index === activeDetailIndex);
  if (!track) return;
  loadedTracks.forEach(item => { item.selected = item === track; });
  renderTrackTable(); updateControls(); saveQueueSoon();
  if (track.metadataError) fetchDetailsBtn.click();
  else if (track.matchError) findMatchesBtn.click();
});

byId('queueSearch').addEventListener('input', () => { renderTrackTable(); updateControls(); });
byId('queueFilter').addEventListener('change', () => { renderTrackTable(); updateControls(); });
byId('selectVisibleBtn').addEventListener('click', () => {
  visibleTracks().forEach(track => { track.selected = true; });
  renderTrackTable(); updateControls(); saveQueueSoon();
});
byId('clearSelectionBtn').addEventListener('click', () => {
  loadedTracks.forEach(track => { track.selected = false; });
  renderTrackTable(); updateControls(); saveQueueSoon();
});

analyzeBtn.addEventListener('click', async () => {
  const rawInput = inputSource.value.trim();
  if (!rawInput) { appendLog('Paste a link or tracklist first.', 'err-msg'); return; }
  analyzeBtn.disabled = true;
  isLoadingInput = true;
  renderTrackTable();
  updateControls();
  analyzeBtn.textContent = 'Loading tracks...';
  let autoFetch = false;
  try {
    const result = await window.djAPI.parseInput(rawInput);
    if (!result.success) throw new Error(result.error);
    loadedTracks = result.tracks.map((track, index) => ({ ...track, index: index + 1, selected: true, status: 'pending',
      matchState: track.directUrl ? 'direct' : 'needed' }));
    collectionSource = result.source;
    collectionInfo = { title: result.title, creator: result.creator, artworkUrl: result.artworkUrl, sourceUrl: result.sourceUrl, warning: result.warning };
    activeDetailIndex = null;
    byId('detailPanel').hidden = true;
    byId('summaryBanner').hidden = true;
    byId('trackCount').textContent = loadedTracks.length;
    byId('collectionTitle').textContent = collectionSubtitle(result);
    showPlaylistCard(result);
    showSourceWarning(result.warning);
    renderTrackTable();
    updateControls();
    appendLog(`Loaded ${loadedTracks.length} tracks from ${result.source}.`, 'sys-msg');
    byId('sourceHint').textContent = 'Paste a track, playlist, or several links.';
    byId('sourceHint').classList.remove('error');
    if (result.warning) appendLog(result.warning, 'sys-msg');
    autoFetch = loadedTracks.some(track => track.needsMetadata && track.soundcloudId);
  } catch (err) {
    appendLog(`Could not load tracks: ${err.message}`, 'err-msg');
    byId('sourceHint').textContent = `${err.message} You can paste an artist–title tracklist instead.`;
    byId('sourceHint').classList.add('error');
  } finally {
    isLoadingInput = false;
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Load tracks <span aria-hidden="true">→</span>';
    renderTrackTable();
    updateControls();
    saveQueueSoon(0);
    if (autoFetch) fetchDetailsBtn.click();
  }
});

trackTableBody.addEventListener('change', event => {
  if (!event.target.matches('.track-select')) return;
  const track = loadedTracks.find(item => item.index === Number(event.target.dataset.index));
  if (!track || isDownloading || isFetchingDetails || isFindingMatches) return;
  track.selected = event.target.checked;
  updateRow(track);
  updateControls();
  saveQueueSoon();
});

selectAll.addEventListener('change', () => {
  visibleTracks().forEach(track => { track.selected = selectAll.checked; });
  renderTrackTable();
  updateControls();
  saveQueueSoon();
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
  saveQueueSoon();
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
  saveQueueSoon();
});

findMatchesBtn.addEventListener('click', async () => {
  const indices = matchesNeeded().map(track => track.index);
  if (!indices.length) return;
  isFindingMatches = true;
  matchProgress = { completed: 0, total: indices.length };
  analyzeBtn.disabled = true;
  renderTrackTable(); updateControls();
  try {
    const result = await window.djAPI.findMatches(indices);
    if (!result.success) throw new Error(result.error);
  } catch (err) {
    isFindingMatches = false;
    analyzeBtn.disabled = false;
    renderTrackTable(); updateControls();
    appendLog(`Could not find matches: ${err.message}`, 'err-msg');
  }
});
cancelMatchesBtn.addEventListener('click', async () => {
  cancelMatchesBtn.disabled = true;
  await window.djAPI.cancelMatches();
});
window.djAPI.onMatchProgress(({ track, completed, total }) => {
  const item = loadedTracks.find(entry => entry.index === track.index);
  if (item) { Object.assign(item, track); updateRow(item); }
  matchProgress = { completed, total };
  updateControls(); saveQueueSoon();
});
window.djAPI.onMatchCompleted(summary => {
  isFindingMatches = false;
  analyzeBtn.disabled = false;
  cancelMatchesBtn.disabled = false;
  renderTrackTable(); updateControls(); saveQueueSoon();
  const review = selectedTracks().filter(track => !track.directUrl && !track.matchUrl && track.candidates?.length).length;
  appendLog(summary.cancelled ? `Match search stopped after ${summary.completed} tracks.`
    : `Match search finished: ${review} need review, ${summary.errors} could not be found.`, summary.errors ? 'err-msg' : 'done-msg');
});

byId('browseBtn').addEventListener('click', async () => {
  try {
    const folder = await window.djAPI.selectFolder();
    if (!folder) return;
    destinationDir = folder;
    byId('destPath').value = folder;
    byId('openFolderBtn').disabled = false;
    updateControls();
    saveQueueSoon();
  } catch (err) { appendLog(`Could not choose destination: ${err.message}`, 'err-msg'); }
});
byId('openFolderBtn').addEventListener('click', () => window.djAPI.openFolder(destinationDir));
byId('clearLogBtn').addEventListener('click', () => { logConsole.textContent = ''; logCount = 0; byId('activityCount').textContent = '0'; });
byId('concurrencyRange').addEventListener('input', event => { byId('concurrencyVal').textContent = event.target.value; saveQueueSoon(); });
byId('crateMode').addEventListener('change', saveQueueSoon);
byId('retryFailedBtn').addEventListener('click', () => {
  const failed = loadedTracks.filter(track => track.status === 'error');
  loadedTracks.forEach(track => { track.selected = failed.includes(track); });
  byId('queueFilter').value = 'selected';
  renderTrackTable(); updateControls(); saveQueueSoon();
  appendLog(`${failed.length} failed tracks selected for retry. Review them, then download selected.`, 'sys-msg');
});

startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  isDownloading = true;
  analyzeBtn.disabled = true;
  cancelBtn.disabled = false;
  byId('summaryBanner').hidden = true;
  pendingTracks().forEach(track => { track.status = 'pending'; track.errorMessage = null; });
  renderTrackTable();
  updateControls();
  saveQueueSoon();
  try {
    const result = await window.djAPI.startDownload({
      destinationDir, selectedIndices: pendingTracks().map(track => track.index),
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
    saveQueueSoon();
  }
});

cancelBtn.addEventListener('click', async () => {
  cancelBtn.disabled = true;
  await window.djAPI.cancelDownload();
});

function updateTrack(track) {
  const item = loadedTracks.find(entry => entry.index === track.index);
  if (item) { Object.assign(item, track); updateRow(item); saveQueueSoon(); }
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
  const banner = byId('summaryBanner');
  banner.hidden = false;
  banner.classList.toggle('has-errors', summary.errors > 0 || summary.cancelled);
  banner.textContent = summary.cancelled ? `Stopped · ${summary.completed} downloaded · ${summary.errors} failed`
    : `${summary.completed} downloaded · ${summary.skipped} already existed · ${summary.errors} failed`;
  appendLog(summary.cancelled ? 'Batch cancelled.' : `Finished: ${summary.completed} downloaded, ${summary.skipped} skipped, ${summary.errors} errors.`, summary.errors ? 'err-msg' : 'done-msg');
  saveQueueSoon();
});

byId('resumeSessionBtn').addEventListener('click', async () => {
  const button = byId('resumeSessionBtn');
  button.disabled = true;
  try {
    const result = await window.djAPI.restoreSession();
    if (!result.success) throw new Error(result.error);
    const session = result.session;
    inputSource.value = session.input || '';
    loadedTracks = session.tracks.map(track => ({ ...track }));
    collectionSource = session.source || '';
    collectionInfo = session.collection || {};
    destinationDir = session.destinationDir || '';
    byId('destPath').value = destinationDir;
    byId('openFolderBtn').disabled = !destinationDir;
    if ([...byId('crateMode').options].some(option => option.value === session.mode)) byId('crateMode').value = session.mode;
    const workers = Number(session.concurrency);
    if (Number.isInteger(workers) && workers >= 1 && workers <= 32) {
      byId('concurrencyRange').value = String(workers);
      byId('concurrencyVal').textContent = String(workers);
    }
    byId('trackCount').textContent = loadedTracks.length;
    byId('collectionTitle').textContent = collectionSubtitle({ ...collectionInfo, source: collectionSource });
    showPlaylistCard(collectionInfo);
    showSourceWarning(collectionInfo.warning);
    sessionPromptOpen = false;
    byId('restoreDialog').hidden = true;
    renderTrackTable(); updateControls(); saveQueueSoon();
    appendLog(`Restored ${loadedTracks.length} tracks. Review and click Download selected when ready.`, 'sys-msg');
  } catch (err) {
    appendLog(`Could not restore session: ${err.message}`, 'err-msg');
    button.disabled = false;
  }
});
byId('discardSessionBtn').addEventListener('click', async () => {
  try {
    await window.djAPI.clearSession();
    sessionPromptOpen = false;
    byId('restoreDialog').hidden = true;
    inputSource.focus();
  } catch (err) { appendLog(`Could not discard session: ${err.message}`, 'err-msg'); }
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
    try {
      const saved = await window.djAPI.getSavedSession();
      if (saved?.tracks?.length && saved.phase !== 'completed') {
        sessionPromptOpen = true;
        const when = saved.savedAt ? new Date(saved.savedAt).toLocaleString() : 'your last session';
        byId('restoreDescription').textContent = `${saved.tracks.length} tracks from ${when}. Restore the queue and progress, or start over. Downloads will wait for you.`;
        byId('restoreDialog').hidden = false;
        byId('resumeSessionBtn').focus();
      }
    } catch (err) { appendLog(`Saved session unavailable: ${err.message}`, 'err-msg'); }
  } catch (err) {
    byId('binaryStatus').textContent = 'Tool error';
    byId('binaryStatus').className = 'engine-status missing';
    appendLog(err.message, 'err-msg');
  }
})();
