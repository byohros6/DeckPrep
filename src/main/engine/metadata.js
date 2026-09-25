// Normalize source titles and artist names before searching, naming, and tagging.
export function cleanTitle(rawTitle) {
  let title = String(rawTitle || '').trim();
  title = title.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  title = title.replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|aiff)$/i, '');
  for (const pattern of [
    /[\[(]\s*official\s*(music\s*)?(video|audio|visualizer)(\s*(hd|4k))?\s*[\])]/gi,
    /[\[(]\s*(lyrics?(\s*video)?|free\s*(download|dl)|music\s*video|visualizer|audio|hd|4k)\s*[\])]/gi,
    /[\[(]\s*(?:video|audio)\s+oficial\s*[\])]/gi,
    /[\[(]\s*video\s+lyric\s*[\])]/gi
  ]) title = title.replace(pattern, '');
  return title.replace(/[\s.]+$/, '').replace(/\s{2,}/g, ' ').trim();
}

export function cleanArtist(rawArtist) {
  return String(rawArtist || '').trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/( - Topic|VEVO| Records| Recordings| Official| Oficial)$/i, '').trim();
}
