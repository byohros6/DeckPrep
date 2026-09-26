# Changelog

## 1.4.0-beta.4

- Fixed the portable Windows build failing every export because FFmpeg was resolved inside the app archive rather than at its executable unpacked path.
- Added a packaged-app check that launches both bundled engines and exports a sample track, so packaging failures fail Windows CI before release.

## 1.4.0-beta.3

- Made matching faster with YouTube-first search and SoundCloud fallback, plus bounded parallel searches tied to the processing-speed setting.
- Improved match scoring for artist names in titles, remixes, duration, and alternate uploads. Close matches are accepted automatically; wrong versions and covers stay for review.
- Rescored saved candidate lists on session restore without new searches, and made automatic selections and remaining review counts visible.

## 1.4.0-beta.2

- Reworked the saved-session prompt with playlist details, selection and completion counts, and a clearer review action.
- Made loading visible immediately, removed the redundant success badge, and improved queue selection controls and playlist card affordance.
- Added processing-speed presets with an advanced exact track-count setting; clarified what the sampler folder does.
- Made Spotify public-preview limits explicit for every playlist and separated dash-form remix names into the Mix/Edit column.

## 1.4.0-beta.1

- Added public Apple Music playlist, album, and song import and clearer source details for all four core platforms.
- Added queue search, filters, bulk selection, and a focused track detail panel.
- Added SoundCloud and YouTube candidate matching with manual review when results are uncertain.
- Added saved queue recovery with a resume-or-discard prompt, failed-track retry selection, and batch summaries.
- Added output MP3 checks, Windows CI packaging, and an in-repository roadmap.
- Added a DeckPrep Windows application icon and refreshed the repository screenshots.

## 1.3.1

- Fetches SoundCloud track details through the public oEmbed endpoint instead of running a full extractor for every track.
- Starts the fast metadata review automatically for SoundCloud playlists and retries transient responses.
- Shows playlist artwork, title, and creator above the queue.
- Makes unavailable track lengths explicit when the public metadata does not supply them.
- Prevents interface labels and playlist artwork from being accidentally selected or dragged while keeping track text copyable.

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
