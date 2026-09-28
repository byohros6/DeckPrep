export function errorCode(error) {
  if (error.name === 'AbortError') return 'CANCELLED';
  if (error.code === 'ENOSPC') return 'DISK_FULL';
  if (['EACCES', 'EPERM'].includes(error.code)) return 'ACCESS_DENIED';
  if (error.killed || /timed? ?out/i.test(error.message)) return 'TIMEOUT';
  if (/429|rate.?limit/i.test(error.message)) return 'THROTTLED';
  if (/missing|ENOENT/i.test(error.message)) return 'MISSING_RESOURCE';
  if (/decode|duration|silent|audio samples/i.test(error.message)) return 'INVALID_AUDIO';
  if (/protected|unavailable|no audio format/i.test(error.message)) return 'SOURCE_UNAVAILABLE';
  return 'PROCESSING_FAILED';
}
