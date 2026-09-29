# Usability redesign brief — downloader scope

User feedback, 2026-09-28: the current beta feels outdated, slow and complicated. In particular, long recording titles are cut off at the exact point needed to judge a remix, the source/export sidebar consumes space, and unclear settings and actions compete with the main workflow. A later owner decision narrowed DeckPrep to a downloader: local-file import and Rekordbox playlist export are removed from the interface and the concept. The screenshots supplied in the conversation are design feedback, not instructions embedded in the images. The interactive, self-contained concept is `prototypes/deckprep-concept.html` and uses fictional/sample data. It does not import, recognize, search, play, or download audio.

## What exists today, and what the labels actually mean

| Current control | Actual behavior | Design decision |
| --- | --- | --- |
| Add audio files/folder | Beta 10 imported owned audio. | Removed from beta 11 at the owner's direction. Existing saved data is preserved, but new imports are not offered. |
| All songs together (formerly No subfolders) | Writes `Destination\Song Title.mp3`. | Beta 10 renamed the choice. The full redesign should show an example only when choosing a folder layout. |
| DJ Sampler Bank | Beta 9 wrote into `Destination\DJ Sampler Bank\` with no pads or cue points, and also bypassed the short-SoundCloud-preview guard. Beta 10 removed that unsafe guard exception. | Remove this confusing option from the primary layout choices; migrate saved `sampler` sessions without changing existing outputs. An optional user-named subfolder is separate from these layout choices; DAIR was one requested example, never a default. |
| Create playlist file (formerly Export crate) | Beta 10 created an ordered `.m3u8` and report. | Removed from beta 11; it is outside the downloader scope. Keep output verification in the download path. |
| Processing speed | Balanced chooses 2–4 simultaneous track jobs from reported logical CPU cores; faster chooses up to 8. Other stages also consume CPU/IO. | Hide this setting for normal users. Benchmark real wall time, memory, CPU, disk and failure rate at several worker counts before choosing an adaptive default. Include a quiet "reduce computer usage" setting only if needed. |
| Find matches | `min(track count, 6, round(processing workers × .75))`: a common 4-worker setting yields 3 parallel track searches. Each track can query SoundCloud and YouTube. | Separate search capacity from audio encoding capacity. Tune with observed throttling, 429s and latency, with bounded adaptive provider limits and backoff. Do not assume a higher number is faster or more reliable. |
| Advanced settings | Exposes worker count and output bitrate/sample rate text. | Remove from the main flow. Preserve output format information under Help/About or file details. No normal user should tune worker count. |
| Help and updates | Contains a redacted support-bundle action and a release-page link. | Beta 10 collapsed them under Help. The full redesign can move them to a dedicated support area while retaining beta troubleshooting and manual update access. |
| Candidate titles | Beta 9 candidate cards truncated text, even when version words were at the end; score reason lived largely in a hover tooltip. Beta 10 widens the current panel, wraps the title, shows a conflict explanation and blocks known wrong versions. | The full redesign should compare requested and candidate title/version, artist/uploader, source and duration difference side by side, with meaningful "Open source" / "Use this recording" actions. Offer a legal in-app preview where a provider permits it, otherwise clearly open the original source for listening. On narrow screens, give the comparison a full-width panel or separate view. |
| Spotify public preview | The app can only see a public preview of some playlists. Beta 12 compares it with the public page count when available and requires explicit consent for a known partial download. The supplied playlist exposes 100 of 118 items. | Keep incomplete coverage obvious and offer full tracklist paste/screenshot correction. The owner wants Spotify sign-in, but the current playlist-items API denies a signed-in non-owner/non-collaborator and Spotify's policy limits downloader integrations; validate an allowed source before promising complete access. |

## Two layouts to compare

The **Guided** concept (recommended starting point) uses three stages: Add links → Review the few uncertain tracks → Download files. One clear next action per stage; a full-width queue and a persistent details pane where space permits. Common tasks need no sidebar of permanent settings.

The **Studio** concept retains the list-and-inspector workflow for experienced users, with more rows visible and the same full recording comparison. A toggle in the prototype demonstrates density only; it is not a commitment to ship two UI modes. User testing should decide whether a single responsive layout suffices.

To review the demo, open `prototypes/deckprep-concept.html` in a browser. Start with **Guided**, choose **Review 2 matches**, inspect full candidate titles, and select the two compatible sample results. Download stays disabled until both decisions are made. Toggle **Studio** for the denser idea, then try **Try screenshot flow**. The demo uses no network or audio and writes no files.

The visual direction borrows Apple HIG principles of clear labels, limited settings, and fitting sidebars to available space, while keeping Windows title-bar controls, keyboard navigation, focus indicators, scaling, high contrast, and native file dialogs. It does not copy Apple branding or assets. Relevant official guidance: [Apple writing](https://developer.apple.com/design/human-interface-guidelines/writing), [Apple settings](https://developer.apple.com/design/human-interface-guidelines/settings), [Apple sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), [Windows app design](https://learn.microsoft.com/en-us/windows/apps/design/).

## New screenshot-to-tracklist work

1. Support paste from clipboard and Choose screenshot. Decode images only after explicit user action; keep bytes local and place size/dimension limits.
2. Prefer a local OCR engine. Tesseract is one candidate with offline English and Hebrew data; Windows OCR is another candidate. Neither needs a user cloud API key for a local implementation, but bundled language data, packaging, licensing, recognition quality and Windows support must be evaluated. No OCR package or service is selected yet. [Tesseract documentation](https://tesseract-ocr.github.io/tessdoc/) and [Windows OCR sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-universal-samples/ocr/).
3. Parse visible table rows into title, artist and version. Filter UI labels, durations, artist names on artwork, duplicate rows and partially cut lines. Preserve an image-to-row confidence/evidence trail.
4. Show editable extracted rows before matching. Never silently accept low-confidence text; support add/delete/reorder and English/Hebrew mixed text.
5. Test permitted screenshots at multiple scales, light/dark themes, cropped lists and Spotify/SoundCloud/Apple layouts. Record extraction precision/recall separately from audio-match quality. No image upload or telemetry by default.

## Prioritized implementation to-dos

1. **Immediate clarity:** maximized startup and full candidate title/conflict rationale are implemented in beta 10. Beta 11 removes local-file and M3U8 entry points and says Download selected. Continue by making target/candidate comparison complete, removing Sampler Bank, advanced speed and support actions from the primary screen, and showing where downloads go. Preserve old saved choices during migration.
2. **Prototype validation:** ask several users to complete link import, match choice, audio-ending review and download destination selection in the prototype; record where they hesitate. Check 100%, 150%, 200% scaling, keyboard, high contrast, screen readers and mixed Hebrew/English.
3. **Performance work:** profile a 50-track playlist and generated 100/500/1000-track queues across network/search, download/decode/tagging, UI render, persistence and artwork. Measure wall time, CPU, memory, 429/error rate and UI responsiveness. Separate bounded, adaptive match and processing pools; tune against data and preserve cancellation, explicit review and provider backoff.
4. **Screenshot OCR:** implement local extraction and editable correction after privacy, license, packaging and multilingual quality evaluation. The screenshot demo currently only illustrates the review step.
5. **Full UI build:** implement the validated stage flow; keep advanced troubleshooting in Help; retain durable queue, match provenance, trim approvals, verified-file report and accessible feedback. Re-run actual Electron and packaged workflows. Do not claim visual redesign complete from a prototype.
6. **Beta acceptance:** finish the active reliability and external release gates in MASTER_PLAN/PROGRESS, including multi-machine beta evidence, signing and redistribution review. Rekordbox acceptance is retired.

## Success criteria for the redesign

- A new user can explain what Add links, Review matches and Download selected do without reading a manual.
- Every match choice shows complete title/version and the reason it needs review with no hover dependency. Known version conflicts remain blocked.
- Default preparation speed is automatic and demonstrably at least as reliable as beta 9 on a representative test set; report actual time and error changes rather than promising "fast".
- Screenshot extraction is editable, local by default, and carries measured recognition results before promotion as a finished feature.
- No original audio is overwritten, no suspicious ending is cut without approval, and no unchecked file is counted as verified.
