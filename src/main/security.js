export function validateSender(event, webContents, expectedUrl) {
  if (!webContents || event.sender !== webContents || event.senderFrame !== webContents.mainFrame || event.senderFrame?.url !== expectedUrl) throw new Error('Untrusted application frame');
}
export function validSelection(indices, tracks) {
  if (!Array.isArray(indices) || !indices.length || !indices.every(Number.isSafeInteger)) throw new Error('Select valid tracks');
  const ids = new Set(indices);
  if (ids.size !== indices.length || tracks.filter(track => ids.has(track.index)).length !== ids.size) throw new Error('Track selection is out of date');
  return tracks.filter(track => ids.has(track.index));
}

export function validatePreferences(value) {
  const result = {};
  if ('input' in value) {
    if (typeof value.input !== 'string' || value.input.length > 1000000) throw new Error('Invalid source input');
    result.input = value.input;
  }
  if ('mode' in value) {
    if (!['flat', 'artist', 'genre', 'sampler', 'partitioned'].includes(value.mode)) throw new Error('Invalid folder layout');
    result.mode = value.mode;
  }
  if ('concurrency' in value) {
    if (!Number.isInteger(value.concurrency) || value.concurrency < 1 || value.concurrency > 12) throw new Error('Invalid processing concurrency');
    result.concurrency = value.concurrency;
  }
  if ('openFolderWhenFinished' in value) {
    if (typeof value.openFolderWhenFinished !== 'boolean') throw new Error('Invalid folder preference');
    result.openFolderWhenFinished = value.openFolderWhenFinished;
  }
  if ('performanceMode' in value && ['balanced', 'gentle', 'fast', 'custom'].includes(value.performanceMode)) result.performanceMode = value.performanceMode;
  if ('phase' in value && ['review', 'downloading', 'completed'].includes(value.phase)) result.phase = value.phase;
  return result;
}
