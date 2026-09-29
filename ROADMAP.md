# DeckPrep roadmap

The complete approved scope is in [MASTER_PLAN](docs/MASTER_PLAN.md). Current implementation evidence and open gates are in [PROGRESS](docs/PROGRESS.md); historical checked items below are not new-release acceptance.

This is the running feature log. The current source checkpoint is **1.4.0-beta.12**. The detailed downloader redesign and screenshot OCR plan is in [UX_REDESIGN](docs/UX_REDESIGN.md). Local-file import and Rekordbox playlist export were retired by owner direction after beta 10.

## In the 1.4 upgrade

- [x] Public SoundCloud, YouTube/YouTube Music, Spotify, and Apple Music track and playlist imports.
- [x] Playlist information, searchable queue, useful filters, bulk selection, and track detail panel.
- [x] Candidate search across SoundCloud and YouTube with review for uncertain matches.
- [x] Save unfinished queues and ask whether to restore them on launch.
- [x] Retry failed rows, keep original files, and decode exported MP3s before reporting success.
- [x] Pass local and hosted packaged Windows, synthetic queue, cancellation, and recovery checks recorded in [QA_REPORT](docs/QA_REPORT.md).
- [x] Remove local-file import and playlist-export entry points to focus on downloading.
- [x] Save into a named playlist folder such as DAIR, and make a known Spotify preview shortfall explicit before a partial download.
- [ ] Recover every item and reliable album/genre metadata for representative playlist links; report honestly where public data is insufficient.
- [ ] Validate the redesigned match and download flow with users, then implement the accepted interface.
- [ ] Add local screenshot-to-tracklist extraction with editable review and measured accuracy.
- [ ] Profile and tune automatic processing/search concurrency across representative workloads.
- [ ] Complete independent-machine, repeat-session, accessibility, signing and rights gates.
- [ ] Publish the final 1.4.0 release after beta review.

## Later candidates

- Spotify sign-in/full playlists only if provider permissions and product policy allow this downloader use case. A signed-in non-owner currently does not receive playlist items through Spotify's API.
- More providers, starting with Bandcamp.
- Additional export formats and quality choices.
- Duplicate detection across sessions and destination folders.
- Optional BPM/key analysis if users ask for it; DJ library export is outside current scope.
- Optional interoperability with playlist-transfer services if they provide a supported integration. Pasted tracklists already provide a manual bridge.

Ideas stay here until their behavior, constraints, and release priority are decided.
