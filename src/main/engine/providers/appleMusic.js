function scriptJson(html, id) {
  const start = html.search(new RegExp(`<script[^>]*id=["']?${id}["']?[^>]*>`, 'i'));
  if (start < 0) return null;
  const bodyStart = html.indexOf('>', start) + 1;
  const bodyEnd = html.indexOf('</script>', bodyStart);
  if (bodyEnd < 0) return null;
  try { return JSON.parse(html.slice(bodyStart, bodyEnd)); } catch { return null; }
}

function artworkUrl(template) {
  return template?.replace('{w}', '300').replace('{h}', '300').replace('{f}', 'jpg') || null;
}

function isoDuration(value) {
  const match = String(value || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

function songItem(item) {
  if (item?.contentDescriptor?.kind !== 'song' || !item.title) return null;
  return {
    source: 'apple',
    title: item.title,
    artist: item.artistName || item.subtitleLinks?.map(link => link.title).filter(Boolean).join(', ') || 'Unknown Artist',
    album: item.tertiaryLinks?.[0]?.title || '',
    artworkUrl: artworkUrl(item.artwork?.dictionary?.url),
    durationSec: Math.round((item.duration || 0) / 1000),
    sourceUrl: item.contentDescriptor.url || null,
    needsMetadata: false
  };
}

export function parseAppleMusicPage(html, url) {
  const playlist = scriptJson(html, 'schema:music-playlist');
  const album = playlist ? null : scriptJson(html, 'schema:music-album');
  const song = playlist || album ? null : scriptJson(html, 'schema:song');
  const schema = playlist || album || song;
  const server = scriptJson(html, 'serialized-server-data');
  if (!schema || !server) throw new Error('Apple Music did not expose a public track list. Paste a tracklist instead.');
  const sections = server.data?.[0]?.data?.sections || [];
  const targetKind = playlist ? 'playlist' : album ? 'album' : 'song';
  const matchingSections = sections.filter(section => section.containerContentDescriptor?.kind === targetKind);
  const songSections = (matchingSections.length ? matchingSections : sections)
    .map(section => (section.items || []).map(songItem).filter(Boolean));
  const expected = playlist?.numTracks || album?.numTracks || (song ? 1 : 0);
  let tracks = songSections.sort((a, b) => b.length - a.length)[0] || [];
  if (song) {
    const id = new URL(url).pathname.split('/').at(-1);
    tracks = tracks.filter(track => track.sourceUrl?.includes(id)).slice(0, 1);
    if (!tracks.length) tracks = songSections.flat().slice(0, 1);
    if (tracks[0]) {
      tracks[0].artist = song.audio?.byArtist?.map(artist => artist.name).filter(Boolean).join(', ') || tracks[0].artist;
      tracks[0].album = song.audio?.inAlbum?.name || tracks[0].album;
      tracks[0].durationSec ||= isoDuration(song.audio?.duration || song.timeRequired);
      tracks[0].artworkUrl ||= song.audio?.image || song.image || null;
    }
  }
  if (!tracks.length || (expected && tracks.length < expected)) {
    throw new Error(`Apple Music showed only ${tracks.length} of ${expected || 'the'} tracks. Paste a complete tracklist instead.`);
  }
  const image = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i)?.[1]
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
  return {
    title: schema.name || tracks[0].title,
    creator: schema.author?.name || schema.byArtist?.name || schema.byArtist?.map?.(artist => artist.name).join(', ')
      || schema.audio?.byArtist?.map(artist => artist.name).join(', ') || tracks[0].artist || '',
    artworkUrl: image || schema.image || tracks[0].artworkUrl,
    sourceUrl: url,
    tracks
  };
}

export async function extractAppleMusic(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Apple Music returned HTTP ${response.status}. Paste a tracklist if this link is unavailable.`);
  return parseAppleMusicPage(await response.text(), url);
}
