# Verification and beta acceptance

## Automated
`npm ci`, `npm run setup:desktop`, `npm run setup:engine`, `npm test`, `npm run test:desktop`, `npm run test:scale`, `npm run dist:portable`.

Desktop tests use generated audio from a local test source, isolated temporary user data, and a real sandboxed Electron window. They cover download into a named DAIR subfolder, incomplete-playlist consent in the UI and main IPC, playback through the ID-scoped protocol, silence review, close/restore, explicit trim, and verified MP3. They also assert that local import and playlist-export entry points are absent. Screenshots go to ignored dist/. For packaged testing set DECKPREP_TEST_EXE to the absolute win-unpacked/DeckPrep.exe path, then run test:desktop. Do not use your normal user-data directory for QA. On this host the Electron process needs desktop-process access outside the restricted test sandbox; an immediate renderer crash inside that sandbox is not an app acceptance result.

Portable engine check: launch the versioned portable executable with `--check-engines=<absolute result.json>`, wait with a bounded timeout, require success and export fields. It generates and exports a local sine recording. This is independent of external providers.

## Recorded evidence
Baseline 32 tests. Latest evidence is in PROGRESS.md; avoid copying stale counts here. Synthetic benchmark runs measure matching/persistence only, not network speed, real matching accuracy, or end-user UI latency.

## External gate checklist
- [ ] Three independent Windows machines, one without development tools.
- [ ] Twenty real beta sessions over at least two weeks.
- [ ] Record Windows, app and engine versions for each result.
- [ ] Open downloaded MP3s from the chosen folder; verify metadata/artwork, playback, trim endpoints and missing-file handling.
- [ ] Keyboard-only flow, Windows Narrator, high contrast, reduced motion, 100/125/150/200% scaling.
- [ ] 200 representative human-labeled recording matches; >=99% automatic precision, report coverage, zero known version-conflict accepts.
- [ ] Representative full-playlist coverage: loaded count equals the provider's visible count, official metadata is independently checked where supplied, and a known partial playlist cannot be mistaken for full success. Test the supplied 118-item DAIR example only with permitted metadata access; no user audio in Git.
- [ ] No unresolved data loss, overwrites, false completion or known wrong-version automation.
- [ ] Signed public distribution and exact third-party redistribution review.

For each beta session record date, anonymized tester ID, environment, input type, number of requested/verified/review/failed tracks, any substitutions/trims, recovery/cancellation behavior, output playback result, and issue references. Never commit private music, tokens, or unredacted diagnostic bundles.
