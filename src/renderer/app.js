import { createAudioReview } from './audioReview.js';
import { selectRange } from './selection.js';

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
let matchWorkers = 3;
let activeDetailIndex = null;
let sessionSaveTimer = null;
let sessionPromptOpen = false;
let logCount = 0;
let cpuCores = 4;
let selectionAnchorIndex = null;
let automaticRecoveryIndices = null;
const audioReview = createAudioReview(byId('audioReview'), track => {
  const current = loadedTracks.find(item => item.id === track.id);
  if (current) Object.assign(current, track);
  renderTrackTable(); updateControls(); saveQueueSoon(0);
  appendLog('Audio choice saved. Choose Download selected to finish the approved file.', 'sys-msg');
}, message => appendLog(message, 'err-msg'));

function presetConcurrency(mode) {
  if (mode === 'gentle') return Math.min(2, Math.max(1, Math.floor(cpuCores / 4)));
  if (mode === 'fast') return Math.min(8, Math.max(4, Math.floor(cpuCores / 2)));
  return Math.min(4, Math.max(2, Math.floor(cpuCores / 3)));
}

function updateSpeed(mode = byId('speedMode').value) {
  if (mode !== 'custom') byId('concurrencyRange').value = String(presetConcurrency(mode));
  const count = Math.max(1, Math.min(12, Number(byId('concurrencyRange').value) || 1));
  byId('concurrencyRange').value = String(count);
  byId('concurrencyVal').textContent = String(count);
  byId('speedHint').textContent = mode === 'gentle'
    ? `${count} ${count === 1 ? 'track' : 'tracks'} at once. Uses fewer computer resources.`
    : mode === 'fast' ? `${count} tracks at once. Faster on a capable computer, with more resource use.`
      : mode === 'custom' ? `${count} ${count === 1 ? 'track' : 'tracks'} at once. Set in Advanced settings.`
        : `${count} tracks at once, chosen for this computer.`;
}

function updateCrateHint() {
  const mode = byId('crateMode').value;
  byId('crateModePreview').textContent = mode === 'artist' ? 'Your folder\\Artist\\Song Title.mp3'
    : mode === 'genre' ? 'Your folder\\Genre\\Song Title.mp3'
      : mode === 'sampler' ? 'Your folder\\DJ Sampler Bank\\Song Title.mp3'
        : mode === 'partitioned' ? 'Your folder\\Genre or Artist\\Song Title.mp3'
        : 'Your folder\\Song Title.mp3';
  byId('crateModeHint').textContent = mode === 'sampler'
    ? 'Full-length songs in one named folder. No sampler pads or cue points.'
    : mode === 'artist' ? 'Missing artist goes in Unknown Artist.'
      : mode === 'genre' ? 'Reads genre when the source provides it; otherwise uses Unknown Genre.'
        : mode === 'partitioned' ? 'Legacy layout: genre folder, or artist if genre is missing.'
          : 'No subfolders. Matching names get an artist suffix to avoid overwriting.';
}

function setRestoreDialogOpen(open) {
  byId('restoreDialog').hidden = !open;
  document.querySelector('.app').inert = open;
  if (open) byId('resumeSessionBtn').focus();
}

function appendLog(message, className = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${className}`;
  entry.textContent = message;
  logConsole.appendChild(entry);
  while (logConsole.children.length > 500) logConsole.firstChild.remove();
  logConsole.scrollTop = logConsole.scrollHeight;
  byId('activityCount').textContent = String(++logCount);
  if (className === 'err-msg' && !loadedTracks.length) byId('activityPanel').open = true;
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDuration(value) {
  const seconds = Math.round(Number(value) || 0);
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
}

function saveQueueNow() {
  clearTimeout(sessionSaveTimer);
  if (!loadedTracks.length || sessionPromptOpen) return Promise.resolve();
  const selected = selectedTracks();
  const complete = selected.length && selected.every(track => ['done', 'skipped'].includes(track.status));
  return window.djAPI.saveSession({
    input: inputSource.value, source: collectionSource, collection: collectionInfo,
    tracks: loadedTracks, destinationDir, mode: byId('crateMode').value,
    openFolderWhenFinished: byId('openFolderWhenFinished').checked,
    concurrency: Number(byId('concurrencyRange').value), performanceMode: byId('speedMode').value,
    phase: isDownloading ? 'downloading' : complete ? 'completed' : 'review'
  });
}
function saveQueueSoon(delay = 150) {
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => saveQueueNow().catch(error => appendLog('Could not save session: ' + error.message, 'err-msg')), delay);
}

function showPlaylistCard(result) {
  const card = byId('playlistCard');
  const artwork = byId('playlistArtwork');
  card.hidden = !result.creator && !result.artworkUrl;
  byId('playlistName').textContent = result.title || '';
  byId('playlistName').title = result.title || '';
  byId('playlistCreator').textContent = result.creator ? `by ${result.creator}` : '';
  byId('playlistCreator').title = result.creator || '';
  card.disabled = !result.sourceUrl;
  card.dataset.url = result.sourceUrl || '';
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
  if (result.source === 'soundcloud') return 'SoundCloud playlist';
  if (result.source === 'youtube') return 'YouTube playlist';
  if (result.source === 'spotify' || result.source === 'apple') return `${result.source === 'spotify' ? 'Spotify' : 'Apple Music'} playlist`;
  return result.title || 'Track queue';
}

function showSourceWarning(message) {
  const warning = byId('sourceWarning');
  warning.hidden = !message;
  warning.replaceChildren();
  if (!message) return;
  const text = document.createElement('span');
  text.textContent = message;
  warning.appendChild(text);
  if (collectionSource === 'spotify') {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'source-warning-action';
    action.textContent = 'Paste full tracklist →';
    action.addEventListener('click', () => { inputSource.focus(); inputSource.select(); });
    warning.appendChild(action);
  }
}

byId('playlistArtwork').addEventListener('error', event => { event.target.hidden = true; });
byId('restoreArtwork').addEventListener('error', event => { event.target.hidden = true; });
byId('playlistCard').addEventListener('click', () => window.djAPI.openSourceLink(byId('playlistCard').dataset.url));

function selectedTracks() { return loadedTracks.filter(track => track.selected); }

function markDuplicates(excludeNew = false) {
  const firstBySong = new Map();
  let changed = false;
  for (const track of loadedTracks) {
    const usable = !track.needsMetadata && track.title && track.artist && track.artist !== '—';
    const key = usable ? [track.artist, track.title, track.mix || ''].map(value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).join('|') : '';
    const first = key ? firstBySong.get(key) : null;
    const duplicateOf = first || null;
    if (track.duplicateOf !== duplicateOf) {
      if (duplicateOf && !track.duplicateOf && excludeNew) track.selected = false;
      track.duplicateOf = duplicateOf;
      changed = true;
    }
    if (key && !first) firstBySong.set(key, track.index);
  }
  return changed;
}
function pendingTracks() { return selectedTracks().filter(track => !['done', 'skipped', 'audio_review'].includes(track.status)); }
function detailsNeeded() { return selectedTracks().filter(track => track.needsMetadata); }
function matchesNeeded() { return selectedTracks().filter(track => !track.needsMetadata && (!track.localPath && (!track.directUrl || track.blockedOriginal)) && !track.matchUrl); }

function visibleTracks() {
  const query = byId('queueSearch').value.trim().toLowerCase();
  const filter = byId('queueFilter').value;
  return loadedTracks.filter(track => {
    if (query && !`${track.title} ${track.artist} ${track.mix || ''}`.toLowerCase().includes(query)) return false;
    if (filter === 'selected') return track.selected;
    if (filter === 'review') return track.status === 'audio_review' || track.needsMetadata || track.matchState === 'review' || ((!track.localPath && (!track.directUrl || track.blockedOriginal)) && !track.matchUrl);
    if (filter === 'failed') return track.status === 'error' || !!track.metadataError || !!track.matchError;
    if (filter === 'done') return ['done', 'skipped'].includes(track.status);
    return true;
  });
}

function displayStatus(track) {
  if (track.status === 'audio_review') return 'Review ending';
  if (track.status === 'inspecting') return 'Checking audio';
  if (!track.selected && !isDownloading) return track.duplicateOf ? `Duplicate of #${String(track.duplicateOf).padStart(3, '0')}` : 'Not selected';
  if (track.status === 'error') return track.blockedOriginal ? isFindingMatches ? 'Finding alternative' : 'Find alternative' : 'Failed';
  if (track.status === 'done') return track.duplicateOf ? 'Verified · duplicate' : 'Verified';
  if (track.status === 'skipped') return 'Already exists';
  if (track.metadataError) return 'Details failed';
  if (track.needsMetadata) return 'Details needed';
  if (track.matchError) return 'Match failed';
  if ((!track.localPath && (!track.directUrl || track.blockedOriginal)) && !track.matchUrl) return track.blockedOriginal ? track.candidates?.length ? 'Review alternative' : 'Find alternative' : track.candidates?.length ? 'Review match' : 'Find match';
  if (track.status === 'pending' && track.matchState === 'matched') return 'Auto matched';
  if (track.status === 'pending' && track.matchState === 'chosen') return 'Match chosen';
  return track.status === 'pending' ? 'Ready' : track.status;
}

function statusClass(track) {
  if (!track.selected && !isDownloading) return 'excluded';
  if (track.status === 'error') return 'error';
  if (track.metadataError) return 'error';
  if (track.needsMetadata) return 'needs-details';
  if (track.matchError) return 'error';
  if ((!track.localPath && (!track.directUrl || track.blockedOriginal)) && !track.matchUrl) return 'needs-details';
  if (track.status === 'pending' && track.matchUrl) return 'matched';
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
  chip.title = track.errorMessage || track.metadataError || track.matchError || (track.duplicateOf ? `Same artist, title, and version as track ${track.duplicateOf}. Select it to export both source links.` : '');
  if (activeDetailIndex === track.index) renderDetail(track);
}

function renderTrackTable() {
  const visible = visibleTracks();
  if (activeDetailIndex !== null && !visible.some(track => track.index === activeDetailIndex)) {
    activeDetailIndex = null;
    byId('detailPanel').hidden = true;
  }
  const filtered = !!byId('queueSearch').value.trim() || byId('queueFilter').value !== 'all';
  byId('visibleCount').hidden = !filtered;
  byId('visibleCount').textContent = filtered ? `${visible.length} shown` : '';
  trackTableBody.innerHTML = visible.length ? visible.map(track => `
    <tr id="track-row-${track.index}" data-index="${track.index}" tabindex="0" class="${track.selected ? '' : 'excluded'} ${activeDetailIndex === track.index ? 'active-row' : ''}">
      <td><input class="track-select" type="checkbox" data-index="${track.index}" aria-label="Select track ${track.index}; Shift-click for a range" title="Shift-click to select a range" ${track.selected ? 'checked' : ''} ${isDownloading || isFetchingDetails || isFindingMatches || isLoadingInput ? 'disabled' : ''}></td>
      <td>${String(track.index).padStart(3, '0')}</td>
      <td class="track-name" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</td>
      <td>${escapeHtml(track.artist)}</td>
      <td>${escapeHtml(track.mix || '—')}</td>
      <td>${formatDuration(track.durationSec)}</td>
      <td><span class="status-chip ${statusClass(track)}" title="${escapeHtml(track.errorMessage || track.metadataError || track.matchError || (track.duplicateOf ? `Same song as track ${track.duplicateOf}. Select it to export both.` : ''))}">${escapeHtml(displayStatus(track))}</span></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="7"><div class="empty-state">${isLoadingInput ? '<span class="loading-spinner" aria-hidden="true"></span>' : ''}<strong>${isLoadingInput ? 'Reading your link' : loadedTracks.length ? 'No matching tracks' : 'Nothing in the queue'}</strong><span>${isLoadingInput ? 'Connecting to the source and collecting track details.' : loadedTracks.length ? 'Change the search or filter to see more.' : 'Paste links or a tracklist on the left, then load tracks.'}</span></div></td></tr>`;
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
    byId('matchingMessage').textContent = `Checking SoundCloud and YouTube for up to ${matchWorkers} tracks at once. Close matches are selected automatically.`;
  } else {
    const review = needed.filter(track => track.candidates?.length).length;
    const automatic = selectedTracks().filter(track => track.matchState === 'matched' && track.matchUrl).length;
    const blocked = needed.filter(track => track.blockedOriginal).length;
    byId('matchingHeadline').textContent = blocked === needed.length
      ? `${needed.length} selected ${needed.length === 1 ? 'track needs' : 'tracks need'} another recording`
      : `${needed.length} selected ${needed.length === 1 ? 'track needs' : 'tracks need'} a match`;
    byId('matchingMessage').textContent = review
      ? `${automatic ? `${automatic} matched automatically. ` : ''}${review} ${review === 1 ? 'track has' : 'tracks have'} candidates to review. Click a track to choose its recording.`
      : blocked ? 'The original source cannot be exported. Search SoundCloud and YouTube for another recording.'
        : 'Find recordings on SoundCloud and YouTube before downloading.';
  }
  findMatchesBtn.hidden = isFindingMatches;
  findMatchesBtn.disabled = isLoadingInput || isFetchingDetails;
  findMatchesBtn.textContent = needed.some(track => track.matchError || track.candidates?.length) ? 'Refresh results' : 'Find matches';
  cancelMatchesBtn.hidden = !isFindingMatches;
}

function updateProgress() {
  const selected = selectedTracks();
  const finished = selected.filter(track => ['done', 'skipped', 'error'].includes(track.status)).length;
  const current = isFetchingDetails ? metadataProgress.completed : isFindingMatches ? matchProgress.completed : finished;
  const total = isFetchingDetails ? metadataProgress.total : isFindingMatches ? matchProgress.total : selected.length;
  const percent = total ? Math.round(current * 100 / total) : 0;
  byId('globalProgressBar').style.width = `${percent}%`;
  byId('globalProgressBar').classList.toggle('has-errors', !isFetchingDetails && !isFindingMatches && selected.some(track => track.status === 'error'));
  byId('progressStats').textContent = isFetchingDetails ? `${current} / ${total} details fetched`
    : isFindingMatches ? `${current} / ${total} matches checked` : `${finished} / ${total} processed`;
  byId('percentText').textContent = `${percent}%`;
}

function updateControls() {
  const selected = selectedTracks();
  const pending = pendingTracks();
  const needed = detailsNeeded();
  const unresolved = matchesNeeded();
  const visible = visibleTracks();
  byId('selectedCount').textContent = `${selected.length} selected`;
  byId('selectionNotice').hidden = !loadedTracks.length || !!selected.length || isLoadingInput;
  selectAll.disabled = !visible.length || isDownloading || isFetchingDetails || isFindingMatches || isLoadingInput;
  selectAll.checked = !!visible.length && visible.every(track => track.selected);
  selectAll.indeterminate = visible.some(track => track.selected) && !selectAll.checked;
  byId('clearSelectionBtn').disabled = !selected.length || isDownloading || isFetchingDetails || isFindingMatches || isLoadingInput;
  startBtn.disabled = isLoadingInput || isDownloading || isFetchingDetails || isFindingMatches || !pending.length || !!needed.length || !!unresolved.length || !destinationDir;
  startBtn.title = needed.length ? 'Fetch details for selected tracks first' : unresolved.length ? 'Review selected audio matches first' : !destinationDir ? 'Choose a destination folder' : !pending.length ? 'All selected tracks are complete' : '';
  byId('retryFailedBtn').hidden = !loadedTracks.some(track => track.status === 'error' && !track.blockedOriginal) || isDownloading;
  byId('cancelImportBtn').hidden = !isLoadingInput;
  updateMetadataBar();
  updateMatchingBar();
  updateProgress();
}

function renderDetail(track) {
  audioReview.render(track, isDownloading || isFindingMatches || isFetchingDetails);
  byId('detailPanel').hidden = false;
  byId('detailNumber').textContent = `TRACK ${String(track.index).padStart(3, '0')}`;
  byId('detailTitle').textContent = track.title;
  byId('detailArtist').textContent = track.artist;
  byId('openOriginalBtn').hidden = !(track.sourceUrl || track.directUrl);
  byId('detailMix').textContent = track.mix || '—';
  byId('detailDuration').textContent = formatDuration(track.durationSec);
  byId('detailSource').textContent = track.source === 'local' && track.localPath ? 'Local audio' : track.source === 'apple' ? 'Apple Music' : track.source === 'youtube' ? 'YouTube' : track.source === 'soundcloud' ? 'SoundCloud' : track.source === 'spotify' ? 'Spotify' : 'Tracklist';
  const help = track.errorMessage || track.metadataError || track.matchError;
  byId('detailHelp').textContent = help || (track.duplicateOf ? `Same artist, title, and version as track ${String(track.duplicateOf).padStart(3, '0')}. This is a separate source link; leave it unchecked unless you want both copies.`
    : track.matchUrl && track.matchState === 'matched' ? 'A close match was selected automatically. Open it to check or choose another.'
    : track.matchUrl ? 'You chose this recording.'
      : track.directUrl && !track.blockedOriginal ? 'Uses the original audio link.'
        : track.candidates?.length ? 'Choose the recording that matches this track.' : 'Find audio matches to see your options.');
  const list = byId('candidateList');
  list.replaceChildren();
  for (const candidate of track.candidates || []) {
    const row = document.createElement('div');
    row.className = 'candidate-row';
    const button = document.createElement('button');
    button.className = `candidate ${candidate.url === track.matchUrl ? 'chosen' : ''}`;
    button.type = 'button';
    const title = document.createElement('strong');
    title.textContent = candidate.title;
    const details = document.createElement('span');
    const incompatible = candidate.evidence?.versionCompatible === false;
    const quality = incompatible ? 'Wrong version' : candidate.score >= 0.8 ? 'Likely' : candidate.score >= 0.55 ? 'Possible' : 'Weak';
    details.textContent = `${candidate.provider} · ${candidate.artist || 'Unknown artist'} · ${formatDuration(candidate.durationSec)} · ${quality} match`;
    const reason = document.createElement('span');
    reason.className = `candidate-reason ${candidate.evidence?.versionCompatible === false ? 'conflict' : ''}`;
    reason.textContent = incompatible
      ? `This result conflicts with the requested ${track.mix || 'recording version'}. Open the source or search again.`
      : candidate.reason || 'Compare title, artist, version and duration with the requested track.';
    button.classList.toggle('conflict', incompatible);
    button.disabled = incompatible || isDownloading || isFindingMatches || isFetchingDetails;
    button.setAttribute('aria-label', `${incompatible ? 'Version conflict: ' : 'Use '}${candidate.title} from ${candidate.provider}. ${reason.textContent}`);
    button.append(title, details, reason);
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
  byId('retryTrackBtn').hidden = (!track.errorMessage && !track.metadataError && !track.matchError) || (track.blockedOriginal && !track.matchError);
  byId('retryTrackBtn').textContent = track.metadataError ? 'Retry details' : track.matchError ? 'Retry match search' : 'Select for retry';
  byId('findAlternativeBtn').hidden = !track.directUrl || !/protected|no audio format|short preview/i.test(track.errorMessage || '') || isFindingMatches;
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
  audioReview.hide();
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
  if (!row) return;
  const index = Number(row.dataset.index);
  if (event.shiftKey || event.ctrlKey) {
    if (selectionLocked()) return;
    changeSelection(index, event.shiftKey);
  } else openDetail(index);
});
trackTableBody.addEventListener('keydown', event => {
  if (event.target.matches('.track-select') && event.key === ' ') {
    event.preventDefault();
    if (!selectionLocked()) changeSelection(Number(event.target.dataset.index), event.shiftKey);
    return;
  }
  if (event.target.matches('tr[data-index]') && event.key === ' ' && (event.shiftKey || event.ctrlKey)) {
    event.preventDefault();
    if (!selectionLocked()) changeSelection(Number(event.target.dataset.index), event.shiftKey);
    return;
  }
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
byId('findAlternativeBtn').addEventListener('click', () => {
  const track = loadedTracks.find(item => item.index === activeDetailIndex);
  if (track) searchMatches([track.index], true);
});

byId('queueSearch').addEventListener('input', () => { selectionAnchorIndex = null; renderTrackTable(); updateControls(); });
byId('queueFilter').addEventListener('change', () => { selectionAnchorIndex = null; renderTrackTable(); updateControls(); });
byId('clearSelectionBtn').addEventListener('click', () => {
  loadedTracks.forEach(track => { track.selected = false; });
  selectionAnchorIndex = null;
  renderTrackTable(); updateControls(); saveQueueSoon();
});

function selectionLocked() {
  return isDownloading || isFetchingDetails || isFindingMatches || isLoadingInput;
}

function changeSelection(index, range = false, explicitValue = null) {
  const track = loadedTracks.find(item => item.index === index);
  if (!track) return;
  const anchor = loadedTracks.find(item => item.index === selectionAnchorIndex);
  const appliedRange = range && anchor && selectRange(visibleTracks(), selectionAnchorIndex, index, anchor.selected);
  if (!appliedRange) track.selected = explicitValue === null ? !track.selected : explicitValue;
  selectionAnchorIndex = index;
  renderTrackTable();
  updateControls();
  saveQueueSoon();
  const checkbox = trackTableBody.querySelector(`.track-select[data-index="${index}"]`);
  if (checkbox) checkbox.focus({ preventScroll: true });
}

analyzeBtn.addEventListener('click', async () => {
  const rawInput = inputSource.value.trim();
  if (!rawInput) { appendLog('Paste a link or tracklist first.', 'err-msg'); return; }
  analyzeBtn.disabled = true;
  isLoadingInput = true;
  analyzeBtn.textContent = 'Reading link…';
  byId('loadingNotice').hidden = false;
  renderTrackTable();
  updateControls();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  let autoFetch = false;
  try {
    const result = await window.djAPI.parseInput(rawInput);
    if (!result.success) throw new Error(result.error);
    installResult(result);
    autoFetch = loadedTracks.some(track => track.needsMetadata && track.soundcloudId);
  } catch (err) {
    appendLog(`Could not load tracks: ${err.message}`, 'err-msg');
    byId('sourceHint').textContent = `${err.message} You can paste an artist–title tracklist instead.`;
    byId('sourceHint').classList.add('error');
  } finally {
    isLoadingInput = false;
    byId('loadingNotice').hidden = true;
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Load tracks <span aria-hidden="true">→</span>';
    renderTrackTable();
    updateControls();
    saveQueueSoon(0);
    if (autoFetch) fetchDetailsBtn.click();
  }
});

trackTableBody.addEventListener('click', event => {
  const checkbox = event.target.closest('.track-select');
  if (!checkbox || selectionLocked()) return;
  event.preventDefault();
  changeSelection(Number(checkbox.dataset.index), event.shiftKey);
});

selectAll.addEventListener('change', () => {
  visibleTracks().forEach(track => { track.selected = selectAll.checked; });
  selectionAnchorIndex = null;
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
  const item = loadedTracks.find(entry => entry.id === track.id);
  if (item) {
    Object.assign(item, track);
    if (markDuplicates(true)) renderTrackTable();
    else updateRow(item);
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

async function searchMatches(indices, force = false, autoResume = false) {
  if (!indices.length) return;
  automaticRecoveryIndices = autoResume ? new Set(indices) : null;
  isFindingMatches = true;
  matchProgress = { completed: 0, total: indices.length };
  analyzeBtn.disabled = true;
  byId('summaryBanner').hidden = true;
  renderTrackTable(); updateControls();
  try {
    const result = await window.djAPI.findMatches(indices, Number(byId('concurrencyRange').value), force);
    if (!result.success) throw new Error(result.error);
    matchWorkers = result.workers;
    updateMatchingBar();
  } catch (err) {
    automaticRecoveryIndices = null;
    isFindingMatches = false;
    analyzeBtn.disabled = false;
    renderTrackTable(); updateControls();
    appendLog(`Could not find matches: ${err.message}`, 'err-msg');
  }
}
findMatchesBtn.addEventListener('click', () => searchMatches(matchesNeeded().map(track => track.index)));
cancelMatchesBtn.addEventListener('click', async () => {
  cancelMatchesBtn.disabled = true;
  await window.djAPI.cancelMatches();
});
window.djAPI.onMatchProgress(({ track, completed, total }) => {
  const item = loadedTracks.find(entry => entry.index === track.index);
  if (item) {
    Object.assign(item, track);
    if (item.blockedOriginal && !item.matchError) { item.status = 'pending'; item.errorMessage = null; }
    updateRow(item);
  }
  matchProgress = { completed, total };
  updateControls(); saveQueueSoon();
});
window.djAPI.onMatchCompleted(summary => {
  const recoveryIndices = automaticRecoveryIndices;
  automaticRecoveryIndices = null;
  isFindingMatches = false;
  analyzeBtn.disabled = false;
  cancelMatchesBtn.disabled = false;
  renderTrackTable(); updateControls(); saveQueueSoon();
  const review = selectedTracks().filter(track => (!track.localPath && (!track.directUrl || track.blockedOriginal)) && !track.matchUrl && track.candidates?.length).length;
  const automatic = selectedTracks().filter(track => track.matchState === 'matched' && track.matchUrl).length;
  const banner = byId('summaryBanner');
  banner.hidden = !summary.cancelled && !automatic && !summary.errors;
  banner.classList.toggle('has-errors', summary.errors > 0);
  banner.textContent = summary.cancelled ? `Search stopped after ${summary.completed} checked`
    : [automatic ? `${automatic} matched automatically` : '', review ? `${review} need review` : '',
      summary.errors ? `${summary.errors} searches failed` : ''].filter(Boolean).join(' · ');
  appendLog(summary.cancelled ? `Match search stopped after ${summary.completed} tracks.`
    : `Match search finished: ${automatic} matched automatically, ${review} need review, ${summary.errors} could not be found.`, summary.errors ? 'err-msg' : 'done-msg');
  if (!summary.cancelled && recoveryIndices) {
    const ready = selectedTracks().filter(track => recoveryIndices.has(track.index) && track.matchState === 'matched' && track.matchUrl);
    if (ready.length) {
      appendLog(`Continuing export for ${ready.length} confidently matched ${ready.length === 1 ? 'track' : 'tracks'}.`, 'sys-msg');
      beginDownload(ready.map(track => track.index));
    }
  }
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
byId('concurrencyRange').addEventListener('input', () => { byId('speedMode').value = 'custom'; updateSpeed(); saveQueueSoon(); });
byId('speedMode').addEventListener('change', () => { updateSpeed(); saveQueueSoon(); });
byId('crateMode').addEventListener('change', () => { updateCrateHint(); saveQueueSoon(); });
byId('openFolderWhenFinished').addEventListener('change', () => {
  localStorage.setItem('openFolderWhenFinished', String(byId('openFolderWhenFinished').checked));
  saveQueueSoon();
});
byId('retryFailedBtn').addEventListener('click', () => {
  const failed = loadedTracks.filter(track => track.status === 'error' && !track.blockedOriginal);
  loadedTracks.forEach(track => { track.selected = failed.includes(track); });
  byId('queueFilter').value = 'selected';
  renderTrackTable(); updateControls(); saveQueueSoon();
  appendLog(`${failed.length} failed tracks selected for retry. Review them, then choose Download selected.`, 'sys-msg');
});

async function beginDownload(indices) {
  if (isDownloading || !indices.length) return;
  isDownloading = true;
  analyzeBtn.disabled = true;
  cancelBtn.disabled = false;
  byId('summaryBanner').hidden = true;
  const ids = new Set(indices);
  loadedTracks.filter(track => ids.has(track.index)).forEach(track => { track.status = 'pending'; track.errorMessage = null; });
  renderTrackTable();
  updateControls();
  saveQueueSoon();
  try {
    const result = await window.djAPI.startDownload({
      destinationDir, selectedIndices: indices,
      concurrency: Math.max(1, Math.min(12, Number(byId('concurrencyRange').value) || 1)), mode: byId('crateMode').value,
      openFolderWhenFinished: byId('openFolderWhenFinished').checked
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
}

startBtn.addEventListener('click', () => {
  if (!startBtn.disabled) beginDownload(pendingTracks().map(track => track.index));
});

cancelBtn.addEventListener('click', async () => {
  cancelBtn.disabled = true;
  await window.djAPI.cancelDownload();
});

function updateTrack(track) {
  const item = loadedTracks.find(entry => entry.index === track.index);
  if (item) {
    const selected = item.selected;
    Object.assign(item, track);
    item.selected = selected;
    updateRow(item);
    saveQueueSoon();
  }
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
  const selected = selectedTracks();
  const downloaded = selected.filter(track => track.status === 'done').length;
  const skipped = selected.filter(track => track.status === 'skipped').length;
  const errors = selected.filter(track => track.status === 'error').length;
  const review = selected.filter(track => track.status === 'audio_review').length;
  const notCompleted = selected.length - downloaded - skipped - errors;
  banner.hidden = false;
  banner.classList.toggle('has-errors', errors > 0 || review > 0 || summary.cancelled);
  const blocked = loadedTracks.filter(track => track.status === 'error' && track.blockedOriginal);
  const resultText = summary.cancelled ? ['Stopped', downloaded ? `${downloaded} downloaded` : '',
    notCompleted ? `${notCompleted} not completed` : '', errors ? `${errors} need attention` : '', review ? `${review} need ending review` : ''].filter(Boolean).join(' · ')
    : [downloaded ? `${downloaded} downloaded` : '', skipped ? `${skipped} already existed` : '',
      errors ? `${errors} need attention` : '', review ? `${review} need ending review` : ''].filter(Boolean).join(' · ');
  banner.replaceChildren(document.createTextNode(resultText));
  if (blocked.length) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'summary-action';
    action.textContent = `Find another recording for ${blocked.length}`;
    action.addEventListener('click', () => searchMatches(blocked.map(track => track.index), true));
    banner.append(action);
  }
  appendLog(summary.cancelled ? 'Batch cancelled.' : `Finished: ${summary.completed} downloaded, ${summary.skipped} skipped, ${summary.errors} need attention.`, summary.errors ? 'err-msg' : 'done-msg');
  saveQueueSoon();
  const newBlocked = blocked.filter(track => track.selected && !track.autoFallbackTried);
  if (!summary.cancelled && newBlocked.length) {
    newBlocked.forEach(track => { track.autoFallbackTried = true; });
    appendLog(`Searching for another recording for ${newBlocked.length} protected ${newBlocked.length === 1 ? 'track' : 'tracks'}.`, 'sys-msg');
    saveQueueSoon();
    searchMatches(newBlocked.map(track => track.index), false, true);
  }
});

byId('resumeSessionBtn').addEventListener('click', async () => {
  const button = byId('resumeSessionBtn');
  const stopButton = byId('cancelRestoreBtn');
  button.disabled = true;
  stopButton.hidden = false;
  stopButton.disabled = false;
  try {
    const result = await window.djAPI.restoreSession();
    if (result.cancelled) { appendLog('Restore stopped. Your saved queue is still available.', 'sys-msg'); return; }
    if (!result.success) throw new Error(result.error);
    const session = result.session;
    inputSource.value = session.input || '';
    loadedTracks = session.tracks.map(track => ({ ...track }));
    markDuplicates();
    collectionSource = session.source || '';
    collectionInfo = session.collection || {};
    destinationDir = session.destinationDir || '';
    byId('destPath').value = destinationDir;
    byId('openFolderBtn').disabled = !destinationDir;
    if (typeof session.openFolderWhenFinished === 'boolean') {
      byId('openFolderWhenFinished').checked = session.openFolderWhenFinished;
      localStorage.setItem('openFolderWhenFinished', String(session.openFolderWhenFinished));
    }
    if ([...byId('crateMode').options].some(option => option.value === session.mode)) byId('crateMode').value = session.mode;
    updateCrateHint();
    const workers = Number(session.concurrency);
    if (Number.isInteger(workers) && workers >= 1 && workers <= 32) {
      byId('concurrencyRange').value = String(Math.min(12, workers));
    }
    byId('speedMode').value = ['gentle', 'balanced', 'fast', 'custom'].includes(session.performanceMode) ? session.performanceMode : 'custom';
    updateSpeed();
    byId('trackCount').textContent = loadedTracks.length;
    byId('collectionTitle').textContent = collectionSubtitle({ ...collectionInfo, source: collectionSource });
    showPlaylistCard(collectionInfo);
    showSourceWarning(collectionInfo.warning);
    sessionPromptOpen = false;
    setRestoreDialogOpen(false);
    renderTrackTable(); updateControls(); saveQueueSoon();
    appendLog(`Restored ${loadedTracks.length} tracks${session.reusedMatches ? `; ${session.reusedMatches} existing candidates matched automatically` : ''}. Review before downloading.`, 'sys-msg');
  } catch (err) {
    appendLog(`Could not restore session: ${err.message}`, 'err-msg');
  } finally {
    stopButton.hidden = true;
    stopButton.disabled = false;
    if (sessionPromptOpen) button.disabled = false;
  }
});
byId('cancelRestoreBtn').addEventListener('click', async () => {
  const button = byId('cancelRestoreBtn');
  button.disabled = true;
  await window.djAPI.cancelRestore();
});
byId('discardSessionBtn').addEventListener('click', async () => {
  try {
    await window.djAPI.clearSession();
    sessionPromptOpen = false;
    setRestoreDialogOpen(false);
    inputSource.focus();
  } catch (err) { appendLog(`Could not discard session: ${err.message}`, 'err-msg'); }
});

(async () => {
  try {
    byId('appVersion').textContent = `v${await window.djAPI.getAppVersion()}`;
    const status = await window.djAPI.checkBinaries();
    const ready = status.ffmpeg?.found && status.ytDlp?.found;
    byId('binaryStatus').hidden = ready;
    byId('binaryStatus').textContent = 'Setup needed';
    byId('binaryStatus').className = 'engine-status missing';
    if (!ready) appendLog('Audio engine is unavailable. Check the setup instructions before exporting.', 'err-msg');
    const info = await window.djAPI.getSystemInfo();
    cpuCores = Math.max(1, Number(info.cpuCores) || 4);
    byId('concurrencyRange').max = '12';
    updateSpeed();
    updateCrateHint();
    byId('openFolderWhenFinished').checked = localStorage.getItem('openFolderWhenFinished') === 'true';
    try {
      const saved = await window.djAPI.getSavedSession();
      if (saved?.tracks?.length && saved.phase !== 'completed') {
        sessionPromptOpen = true;
        const selected = saved.tracks.filter(track => track.selected).length;
        const completed = saved.tracks.filter(track => track.selected && ['done', 'skipped'].includes(track.status)).length;
        byId('restoreName').textContent = saved.collection?.title || 'Previous queue';
        byId('restoreDescription').textContent = `${saved.tracks.length} tracks${saved.collection?.creator ? ` · by ${saved.collection.creator}` : ''}`;
        byId('restoreSelected').textContent = String(selected);
        byId('restoreCompleted').textContent = `${completed} / ${selected}`;
        byId('restoreWhen').textContent = saved.savedAt ? new Date(saved.savedAt).toLocaleString() : 'Earlier';
        byId('restoreDestination').textContent = saved.destinationDir ? `Destination: ${saved.destinationDir}` : 'Choose a destination after restoring.';
        const savedArt = saved.collection?.artworkUrl || '';
        byId('restoreArtwork').hidden = !/^https:\/\/(?:[^/]+\.)?(?:sndcdn\.com|mzstatic\.com)\//i.test(savedArt) && !/^https:\/\/i\.(?:scdn\.co|ytimg\.com)\//i.test(savedArt);
        if (!byId('restoreArtwork').hidden) byId('restoreArtwork').src = savedArt;
        setRestoreDialogOpen(true);
      }
    } catch (err) { appendLog(`Saved session unavailable: ${err.message}`, 'err-msg'); }
  } catch (err) {
    byId('binaryStatus').hidden = false;
    byId('binaryStatus').textContent = 'Setup needed';
    byId('binaryStatus').className = 'engine-status missing';
    appendLog(err.message, 'err-msg');
  }
})();

function installResult(result) {
    loadedTracks = result.tracks.map((track, index) => ({ ...track, index: index + 1, selected: true, status: 'pending',
      matchState: track.directUrl || track.localPath ? 'direct' : 'needed' }));
    selectionAnchorIndex = null;
    markDuplicates(true);
    collectionSource = result.source;
    collectionInfo = { title: result.title, creator: result.creator, artworkUrl: result.artworkUrl, sourceUrl: result.sourceUrl, warning: result.warning };
    byId('queueSearch').value = '';
    byId('queueFilter').value = 'all';
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

}

byId('cancelImportBtn').onclick = () => window.djAPI.cancelImport();
byId('diagnosticsBtn').onclick = async () => {
  try { const result = await window.djAPI.exportDiagnostics(); if (result.success) appendLog('Redacted diagnostics saved.', 'sys-msg'); }
  catch (error) { appendLog(error.message, 'err-msg'); }
};
byId('updatesBtn').onclick = () => window.djAPI.openReleases();
window.djAPI.onFlushBeforeClose(async () => {
  try { await saveQueueNow(); window.djAPI.acknowledgeFlush(true); }
  catch { window.djAPI.acknowledgeFlush(false); }
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); byId('queueSearch').focus(); }
  if (event.key === 'Escape') { audioReview.hide(); byId('closeDetailBtn').click(); }
});
