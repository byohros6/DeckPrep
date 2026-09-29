# Changelog

## 1.4.0-beta.10 (design checkpoint)

- Open the Windows app maximized and verify that behavior in the desktop workflow.
- Widen match details, wrap full candidate titles, display version evidence, and block incompatible manual choices and conflicting saved selections.
- Keep short SoundCloud preview rejection independent of folder layout; the legacy Sampler Bank folder no longer bypasses that guard.
- Clarify the existing interface: Prepare selected also covers local audio, Create playlist file explains the optional Rekordbox handoff, All songs together names the flat layout, and support actions move under Help and updates.
- Add a clickable guided/studio interface concept and a detailed redesign backlog informed by user feedback. The prototype is illustrative; screenshot OCR and the new interface are not yet part of the app.


## 1.4.0-beta.9 (implementation preview)

- Reject explicit conflicting recordings (live, instrumental, clean/explicit, speed variants) and preserve Unicode matching and candidate evidence.
- Serialize versioned session saves, retain a recovery backup, and persist main-process progress.
- Decode audio fully before success, inspect possible silent endings, and require preview/review before applying a trim. Preserve original audio.
- Add local audio imports, waveform/audio review, verified output manifests, and ordered relative-path M3U8 crate export.
- Bound processing stages, preserve multi-link warnings, and keep source bitrate distinct from output quality.
- Enable renderer sandboxing and validate IPC senders; update Electron to 44.4.5 and packaging to 26.15.3.
- Add actual Electron review/restore/trim/export tests, generated-audio regression tests, synthetic scale checks, and persistent plan/progress/acceptance documentation.
- This is a development beta, not a completed stable release: real Rekordbox, multi-machine beta, representative matching precision, signing and redistribution gates remain open.


## 1.4.0-beta.8

- Automatically search for another SoundCloud or YouTube recording after a selected source proves protected or lacks exportable audio, and continue exporting a confident match once. Never retry the same blocked SoundCloud track as an alternative.
- Accept a strong title, artist, and version match when SoundCloud does not supply the original duration; keep short clips and uncertain versions for review.
- Keep the matching queue in sync with completed downloads so automatic recovery can see a blocked source, and make Stop immediately release stalled metadata or match searches.
- Keep the result honest: finding a match does not count as a download, and the final batch banner reflects the whole selected queue. Uncertain matches wait for review.

## 1.4.0-beta.7

- Added Shift-click range selection across visible tracks and Ctrl-click row toggling, with keyboard access to the same actions.
- Removed duplicate queue controls and counts; kept the header checkbox for selecting all shown tracks and a single clear-selection action.
- Made protected-source failures lead to a direct alternative-recording search, while keeping per-track reasons visible in details.
- Kept routine download errors in the track list and result banner instead of automatically expanding the activity log.
- Rechecked the packaged app with the 429-track SoundCloud playlist, keyboard range selection, protected-source recovery, and a verified MP3 export; refreshed both README screenshots.

## 1.4.0-beta.6

- Added an **Open folder when finished** option near the destination. It is off by default, saved across sessions, and only opens the destination after a successful batch when enabled.
- Corrected the saved-session completion count to include only currently selected tracks.
- Kept the user's current row selections intact while download progress updates arrive, so the queue and progress counts stay accurate.
- Reset the previous queue's search and filter after importing a new source, so the new tracks are visible immediately.
- Show unfinished tracks explicitly after cancellation, with progress reflecting the work that actually completed.
- Closed track details when a search or filter hides that row, and clarified when an alternative recording has been chosen.
- Manually checked the packaged app with the 429-track SoundCloud playlist: queue restore, selection, duplicate handling, all four folder layouts, successful exports, protected-source failure and alternate selection, and cancellation.

## 1.4.0-beta.5

- Export filenames now use the song title without a playlist number or artist prefix; colliding titles get an artist suffix instead of overwriting files.
- SoundCloud playlist names no longer fill the Album tag. Unknown albums remain blank, including in restored queues.
- Split the ambiguous folder choice into artist and genre layouts, with an exact path preview for every layout.
- Mark repeated artist/title/version entries as duplicates and leave later copies unchecked by default.
- Show processed, downloaded, and failed counts separately. Protected SoundCloud recordings receive a clear error and an alternative-recording search in track details.

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
