const format = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function createAudioReview(container, onDecision, onError) {
  let currentId = null;
  function hide() {
    container.querySelector('audio')?.pause();
    container.replaceChildren(); container.hidden = true; currentId = null;
  }
  function render(track, busy) {
    if (!track.inspection) { hide(); return; }
    container.hidden = false;
    if (currentId === track.id) {
      for (const button of container.querySelectorAll('button')) button.disabled = busy;
      return;
    }
    hide(); container.hidden = false; currentId = track.id;
    const inspection = track.inspection;
    const heading = document.createElement('h3'); heading.textContent = track.status === 'audio_review' ? 'Possible silent ending' : 'Audio inspection';
    const summary = document.createElement('p'); summary.className = 'detail-help';
    summary.textContent = `Decoded ${format(inspection.durationSec)} · ${inspection.codec || 'audio'}${inspection.sourceBitrateKbps ? ` · source ${inspection.sourceBitrateKbps} kbps` : ''}.`;
    const waveform = document.createElement('canvas'); waveform.width = 600; waveform.height = 110; waveform.className = 'audio-waveform'; waveform.setAttribute('aria-label', 'Waveform overview; use the player to seek precisely');
    const context = waveform.getContext('2d'); context.fillStyle = '#17212b'; context.fillRect(0, 0, 600, 110);
    const values = inspection.waveform || []; const max = Math.max(0.01, ...values);
    context.fillStyle = '#83b8ea';
    values.forEach((value, i) => { const height = Math.max(1, value / max * 90); context.fillRect(i / values.length * 600, (110 - height) / 2, Math.max(1, 600 / values.length), height); });
    if (inspection.ending) { context.fillStyle = '#dbaa5544'; context.fillRect(inspection.ending.startSec / inspection.durationSec * 600, 0, 600, 110); }
    container.append(heading, summary, waveform);
    if (track.status !== 'audio_review') return;
    const explanation = document.createElement('p'); explanation.className = 'detail-help';
    explanation.textContent = `Possible quiet tail from ${format(inspection.ending.startSec)} to ${format(inspection.durationSec)}. Listen before choosing. Your original stays unchanged.`;
    const player = document.createElement('audio'); player.controls = true; player.preload = 'metadata'; player.src = window.djAPI.previewUrl(track.id);
    player.setAttribute('aria-label', 'Preview original recording');
    player.addEventListener('loadedmetadata', () => { player.currentTime = Math.max(0, inspection.ending.startSec - 5); });
    player.addEventListener('error', () => onError('Preview is unavailable. Keep the full recording or retry after checking its source.'));
    const label = document.createElement('label'); label.className = 'field-label'; label.textContent = 'Export endpoint (seconds)';
    const input = document.createElement('input'); input.type = 'number'; input.min = '0.1'; input.max = String(inspection.durationSec); input.step = '0.1'; input.value = inspection.ending.suggestedEndSec.toFixed(1); label.append(input);
    const actions = document.createElement('div'); actions.className = 'review-actions';
    const seek = document.createElement('button'); seek.className = 'button button-secondary'; seek.textContent = 'Preview endpoint';
    seek.onclick = () => { player.currentTime = Math.max(0, Number(input.value) - 5); player.play().catch(error => onError(error.message)); };
    for (const [action, text] of [['keep', 'Keep full recording'], ['trim', 'Approve trimmed export']]) {
      const button = document.createElement('button'); button.className = 'button button-secondary'; button.textContent = text; button.disabled = busy;
      button.onclick = async () => {
        if (action === 'trim' && !input.reportValidity()) return;
        button.disabled = true;
        try {
          const result = await window.djAPI.reviewAudio(track.id, {action, endSec: Number(input.value)});
          if (!result.success) throw new Error(result.error);
          hide(); onDecision(result.track);
        } catch (error) { onError(error.message); button.disabled = false; }
      };
      actions.append(button);
    }
    container.append(explanation, player, label, seek, actions);
  }
  return {render, hide};
}
