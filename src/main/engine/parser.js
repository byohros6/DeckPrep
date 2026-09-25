/** Parse local audio filenames into display metadata. */

// Parse unstructured or semi-structured text line into artist, title, remix/version
export function parseTracklistLine(line) {
  let cleanLine = line.replace(/^\uFEFF/, '').trim();
  if (!cleanLine) return null;

  // 1. Strip leading mix cue timestamps first if present: e.g. "[04:20]", "04:20", "[01:15:30]", "04:20 - "
  cleanLine = cleanLine.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–—:]?\s*/, '').trim();

  // 2. Remove genuine leading track numbering: "01. ", "01) ", "1 - ", "[01] ", "#01 ", "01 " (with leading zero)
  const trackNumMatch = cleanLine.match(/^(?:#?\d{1,3}[\.\)]|#\d{1,3}|\[\d{1,3}\]|\d{1,3}\s*[-–—]\s+(?=.+[-–—:])|^0\d{1,2}\s+)\s*/);
  if (trackNumMatch) {
    cleanLine = cleanLine.substring(trackNumMatch[0].length).trim();
  }

  // 3. Strip timestamp again if it occurred after track number (e.g. "01. [04:20] Artist - Title")
  cleanLine = cleanLine.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–—:]?\s*/, '').trim();

  // Extract duration if present at end: e.g. "[4:20]", "(3:45)", "4:20", "[1:15:30]"
  let durationSec = null;
  const durationMatch = cleanLine.match(/(?:[\(\[]|\s+[-–—]?\s*)(\d{1,2}):(\d{2})(?::(\d{2}))?[\)\]]?$/);
  if (durationMatch) {
    if (durationMatch[3] !== undefined) {
      // hh:mm:ss format
      durationSec = parseInt(durationMatch[1], 10) * 3600 + parseInt(durationMatch[2], 10) * 60 + parseInt(durationMatch[3], 10);
    } else {
      // mm:ss format
      durationSec = parseInt(durationMatch[1], 10) * 60 + parseInt(durationMatch[2], 10);
    }
    cleanLine = cleanLine.substring(0, durationMatch.index).trim();
  }

  // Look for standard separator: "Artist - Title", "Artist – Title", "Artist : Title", "Artist | Title"
  const separatorMatch = cleanLine.match(/\s+[-–—:|]\s+/);
  let artist = 'Unknown Artist';
  let title = cleanLine;

  if (separatorMatch) {
    const idx = cleanLine.indexOf(separatorMatch[0]);
    artist = cleanLine.substring(0, idx).trim();
    title = cleanLine.substring(idx + separatorMatch[0].length).trim();
  }

  // Clean surrounding quotes
  artist = artist.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  title = title.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();

  // Extract mix / edit description in parentheses or brackets: e.g. "(Fisher Rework)", "[Club Mix]"
  let mix = '';
  const mixMatch = title.match(/[\(\[](.*?((?:mix|edit|rework|remix|vip|dub|flip|bootleg|version)).*?)[\)\]]/i);
  if (mixMatch) {
    mix = mixMatch[1].trim();
  }

  return {
    raw: line,
    artist,
    title,
    mix,
    durationSec,
    source: 'local'
  };
}

// Bulk parse text lines
export function parseBulkText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tracks = [];
  for (const line of lines) {
    const parsed = parseTracklistLine(line);
    if (parsed) tracks.push(parsed);
  }
  return tracks;
}
