# DeckPrep master plan

Approved for implementation on 2026-09-28. This began as the combined scope of two planning drafts. The owner subsequently narrowed the product to a downloader on 2026-09-28; that direct decision supersedes the local-file and Rekordbox requirements below. Historical implementation and evidence remain in PROGRESS.md rather than being erased.

## Purpose and agreed defaults
Dependable Windows music downloading from public links and pasted tracklists for the owner and friends, a portfolio case study grounded in evidence, and a possible future paid desktop product. Promise: find the intended recording, review uncertain choices or suspicious audio, and save verified files you can trust.

Windows first; retain confident automatic matching; local processing, no accounts or telemetry; preserve existing files; suspicious endings require preview and approval before trimming. The active workflow is links/tracklists → match/review → download to a chosen folder. No new local-audio import or Rekordbox playlist workflow. Dark studio design with Apple-inspired restraint and Windows conventions. No wholesale framework rewrite or cloud infrastructure.

## Baseline assessment
Electron renderer -> narrow preload -> main-process orchestration -> source metadata/matching -> yt-dlp acquisition -> FFmpeg conversion -> ID3/artwork -> organized files. Spotify/Apple supply metadata, not extracted streams. JSON restores unfinished sessions.

Accomplishments: complete review/export flow; filters/selection/duplicates/manual match review; concurrent jobs, cancellation and recovery; temporary outputs/collision protections; pinned checksum-verified yt-dlp; Windows CI packaged export; documentation/screenshots/changelog. Baseline 32 tests passed, including generated local audio download/conversion/tagging. History documents 429-track manual tests, not independently reproduced in the planning review. No fresh Rekordbox compatibility evidence.

13 visible baseline commits developed the workflow rapidly. Engine boundaries are reasonable; the 863-line renderer and overlapping main/renderer state are the next maintainability limit. Scaling constraints: provider throttling, processes, rendering/persistence, unbounded caches/logs, asynchronous synchronization. Reliability means honest outcomes and recoverable failures, not every link succeeding.

Reproduced weaknesses: Live/Instrumental/Clean variants automatically scored 1.0; fabricated ID3 header+padding accepted as MP3. Other risks: overlapping session writes; debounced close data loss; unbounded operations; uncancellable artwork; inconsistent mix identity; dropped multi-link warnings; sandbox disabled/uneven IPC validation; fabricated genre; JPEG compatibility not actually normalized.

## A. Reliability and architecture
- Preserve requested metadata separately from selected recording/provenance. Recognize live/studio, instrumental/vocal, clean/explicit, remix/edit, and speed conflicts. Explain heuristic scores; insufficient evidence requires review. One automatic recovery; exclude blocked recordings; log selection method and substitution reason.
- Consistent version/title tags/filenames/skip checks; unknown genre/album stay blank. Export identity manifest; conservative legacy file reuse.
- Full decode and duration verification against selected recording or approved trim; reject empty/corrupt/truncated audio. Preserve originals, temporary output, collisions, no overwrite. Normalize/limit artwork; optional-art failure is a warning.
- Main owns durable state; stable track/job IDs; reject stale events. Serialized saves, last-good backup, validation, version-1 migration, prompt completed-transition persistence, graceful shutdown flush, no auto restart, restored output revalidation.
- Cancellation/time bounds for import/metadata/search/download/convert/artwork/inspection. Structured errors; bounded transient retries/backoff. Preserve per-input successes and warnings.
- Supported Electron, sandbox, IPC sender/payload validation, deny unexpected navigation/windows/permissions. Focused renderer modules, incremental types, bounded logs/caches, isolate test utilities.
- Versioned contracts: Track/requested metadata, SelectedRecording/provenance, Job/errors, AudioInspection, TrimDecision, verification/export manifests. Approved track IDs rather than arbitrary renderer paths for preview/inspection.

## B. Audio inspection and UI
Motivating SoundCloud track: https://soundcloud.com/matan-suissa/mi-bat-yam-ad-hanetzach-x-beso-suissa-edit-omer-adam-friends . Screenshot shows 11:04; owner reports music ends ~3 minutes. Exact endpoint has NOT been independently analyzed.

Inspect acquired audio before final export in bounded background jobs. Keep provider/decoded/last-audible durations distinct; scan whole recording and both channels, preserving internal breakdowns/hidden later audio. Review defaults: trailing below -50 dBFS >=10 seconds, or below -40 dBFS >=30 seconds and >=10% of file. Version analysis configuration. These are suspicion signals, not artistic endpoint detection.

Show possible-silence interval/duration, waveform and preview around boundary and remaining tail. Keep full / Trim export / Adjust endpoint. Flagged rows await decisions while others continue. Suggest boundary+2 seconds capped to full duration. Precise adjustment; explicit approval; preserve acquired source until resolved and across unfinished-session recovery. Apply trim during final encode, verify and record it. Never auto-cut intros/internal silence/fades/reverb.

Also inspect empty audio/decode failures/truncation/internal silence/duration discrepancies; peak/loudness informational only; source codec/bitrate distinct from output settings. No 320 kbps quality-restoration claims. Separate match confidence from audio integrity. Defer normalization/compression/denoising.

UI: shared typography/spacing/color/radius/elevation/states, dark neutral surfaces, restrained accent, clear hierarchy and dense readable table. Windows system typography/native controls/dialogs/Ctrl shortcuts. Source+destination, queue, focused inspector, persistent progress. Waveform/trim/provenance; distinguish Downloaded/Needs review/Verified/Exported. Preserve scroll/selection; incremental updates; actionable errors; progressive advanced controls. Keyboard, focus, screen reader, reduced motion, high contrast, 100-200% scaling, non-color statuses, Hebrew/Latin bidirectional titles. Polish empty/loading/partial/offline/cancelled/restored/missing-engine states.

## C. Download-only scope (owner revision)
The previous local-audio import and Rekordbox/M3U8 objectives are retired at the owner's direction. Remove their entry points and playlist export from the app and redesign demo. Keep already-downloaded files and saved data intact; legacy local-file sessions may be completed without offering new local imports. Do not require Rekordbox acceptance to release a downloader.

The active result is a verified MP3 in a chosen destination, with clear per-track success, review, failure and retry states. Preserve collision protection and the source/decision/verification manifest. Keep artist and genre folder layouts only as optional download organization, subject to usability feedback.

## D. Distribution, testing and portfolio
Tagged versioned builds, checksums, notes, limitations, compatibility matrix, clean-machine checks. Portable friend beta; signing before broad public promotion. Tested engine updates, manual update check/link initially. Explicit diagnostic export redacts paths/URLs by default. Contributor docs/architecture/support/licenses. Never publish `.dajent-analysis` extraction; independent integrations.

Regression tests: version conflicts/ambiguity/missing duration/non-Latin/blocked recovery/provenance; generated silence-tail/fade/reverb/breakdown/later audio/one-channel silence/noise floor/empty/corrupt/truncated/duration/approved trim; concurrent save/corruption/migration/close/crash/stale events/collisions/disk; cancel every stage/stalls/artwork/throttle/mixed import warnings; real IPC and packaged UI.

Acceptance: synthetic 100/500/1000 queues and named-machine memory/latency/save/cancel benchmarks; Stop immediate acknowledgment and <=5 seconds controlled shutdown; >=200 labeled matching cases, >=99% automatic precision and zero known version-conflict accepts (report coverage separately); keyboard, Hebrew/English, scaling, screen reader, preview/selection tests. >=3 Windows machines including clean non-development machine; >=20 beta sessions across >=2 weeks; no unresolved data-loss/overwrite/false-success/known wrong-version defects. Verified download/open/playback in the chosen folder.

Portfolio: permitted demo audio, short walkthrough and case study on problem/architecture/tradeoffs/failure prevention; examples of match/silence review/recovery and verified downloads; measured beta outcomes, distinguish verified behavior from ambitions.

## E. Growth/commercial validation
Next: download history, cross-session duplicates, missing-track reports, reusable settings. SQLite when persistent history scope arrives; JSON sufficient initially. Defer extra platforms/private accounts/cloud/stems/auto cues/library integration pending demand.

Free beta first. Measure recurring use/time saved, then validate whether a paid downloader has defensible user value. No invented pricing/payments before evidence. Review provider permissions and exact binary/dependency redistribution (installed ffmpeg-static declares GPL-3.0-or-later; MIT project license does not settle bundled obligations), with legal review before commercial release.

References: https://www.electronjs.org/docs/latest/tutorial/security ; https://ffmpeg.org/ffmpeg-filters.html#silencedetect ; https://developer.apple.com/design/human-interface-guidelines/foundations ; https://learn.microsoft.com/en-us/windows/apps/develop/input/keyboard-interactions ; https://rekordbox.com/en/support/ ; https://www.youtube.com/static?template=terms ; https://pages.soundcloud.com/legal/terms-of-use ; https://www.ffmpeg.org/legal.html

## F. User-directed usability redesign (added 2026-09-28)

The owner finds beta 9 outdated and overly complex. Make the app open maximized. Prioritize complete, readable recording titles and version evidence in the match decision. Simplify the main workflow into adding links/tracklists, reviewing only uncertain tracks, and downloading verified files. The later download-only decision removes local-file and Rekordbox controls. Clarify destination and folder layout. Move technical speed and support controls out of the main flow while preserving diagnostics and update access elsewhere. Profile and tune separate match and processing concurrency before replacing settings with an automatic default. Add local-first, editable screenshot-to-tracklist OCR; do not assume a cloud API key is needed. Validate the visual direction and actual user comprehension before full implementation. See UX_REDESIGN.md and the standalone prototype.

## G. Owner's DAIR acceptance example (2026-09-29)

The primary target is now: paste a playlist, choose a parent destination and playlist folder name (for example DAIR), resolve the intended recordings, write only verified files with available trustworthy metadata, and show a clear finished/failure report. Keep the application focused on this path; optional inspection should interrupt only suspicious tracks. This direct owner clarification outranks historical bot summaries and speculative features.

The supplied Spotify link publicly advertises 118 items, while the embed provides only 100. Beta 12 detects this known shortfall and requires an explicit partial-download choice; it does not retrieve the missing 18. Spotify sign-in was requested, but the owner is not that playlist's owner or collaborator. Spotify's current Get Playlist Items API returns 403 to that account class, and its endpoint policy says apps must not facilitate downloads of Spotify content. Do not promise a sign-in fix or commercialize this integration without a working permitted path. Pasted complete tracklists and the planned local screenshot correction are user-provided fallbacks, not equivalent to official Spotify album/genre data. Album and genre must remain blank when absent; version matching remains reviewable rather than guaranteed exact by title alone.
