# Changelog

## 1.3.0

- Added a metadata-only review step before audio downloads for playlist entries without details.
- Added per-track selection, select all, retry for failed details, and cancellable lookup progress.
- Downloads only selected tracks and keeps original playlist numbering in filenames.

## 1.2.1

- Fixed SoundCloud playlists whose fast listing omits track titles.
- Resolves full track names, artists, and durations during download before naming and tagging files.
- Shows the playlist title and track count in the queue.
- Defaults to four simultaneous tracks for larger playlists.

## 1.2.0

- Rebuilt the desktop interface with a compact source panel and track-focused queue.
- Removed the native menu, simplified export controls, and moved activity into a collapsible panel.
- Accepts multiple links pasted on separate lines.
- Streamlined the download flow and updated the project description.

## 1.1.0

- Renamed the app DeckPrep and restored link-first ingestion and downloads.
- Added a permission confirmation before downloading.
- Added duration matching, short-preview handling, and temporary output files to reduce wrong or incomplete exports.
- Added a controlled end-to-end test of URL download, MP3 conversion, and tagging.
- Shows the package version in the app header.

## 1.0.0

- Initial Electron app for link and tracklist ingestion, batch downloads, and DJ crate export.
