# DeckPrep roadmap

The complete approved scope is in [MASTER_PLAN](docs/MASTER_PLAN.md). Current implementation evidence and open gates are in [PROGRESS](docs/PROGRESS.md); historical checked items below are not new-release acceptance.

This is the running feature log. The current source checkpoint is **1.4.0-beta.10**. The detailed usability redesign and screenshot OCR plan is in [UX_REDESIGN](docs/UX_REDESIGN.md).

## In the 1.4 upgrade

- [x] Public SoundCloud, YouTube/YouTube Music, Spotify, and Apple Music track and playlist imports.
- [x] Playlist information, searchable queue, useful filters, bulk selection, and track detail panel.
- [x] Candidate search across SoundCloud and YouTube with review for uncertain matches.
- [x] Save unfinished queues and ask whether to restore them on launch.
- [x] Retry failed rows, keep original files, and decode exported MP3s before reporting success.
- [x] Pass local and hosted packaged Windows, synthetic queue, cancellation, and recovery checks recorded in [QA_REPORT](docs/QA_REPORT.md).
- [ ] Validate the redesigned match and export flow with users, then implement the accepted interface.
- [ ] Add local screenshot-to-tracklist extraction with editable review and measured accuracy.
- [ ] Profile and tune automatic processing/search concurrency across representative workloads.
- [ ] Complete independent-machine, repeat-session, Rekordbox, accessibility, signing and rights gates.
- [ ] Publish the final 1.4.0 release after beta review.

## Later candidates

- Private playlist account connections, if provider access supports them.
- More providers, starting with Bandcamp.
- Additional export formats and quality choices.
- Duplicate detection across sessions and destination folders.
- DJ library export formats and optional BPM/key analysis.
- Optional interoperability with playlist-transfer services if they provide a supported integration. Pasted tracklists already provide a manual bridge.

Ideas stay here until their behavior, constraints, and release priority are decided.
