# Beta 9 QA evidence — 2026-09-28

Environment: Windows 10.0.26200, x64, Intel Core i7-12700H, Node 24.12.0, Electron 44.4.5. This is one development machine, not the three-machine release gate.

- Engine/regression suite: 43 tests passed.
- Actual sandboxed Electron: local import -> generated 3s tone + 15s quiet tail -> waveform/player -> close and restore review -> approve 5s trim -> decoded MP3 -> relative M3U8. Source bytes unchanged. No renderer errors.
- Synthetic desktop input/render/search at 100 tracks: 88ms / 15ms; 500: 174ms / 33ms; 1000: 314ms / 51ms. These are single-run observations, not latency guarantees.
- Synthetic matching/save+restore at 100: 6ms / 9ms; 500: 11ms / 6ms; 1000: 18ms / 7ms. Node process RSS 51-52MB; this is not total Electron/process memory.
- Controlled cancellation test: active workers stop, queued jobs do not start, completion fires once after durable callbacks; under the five-second test bound.
- Dependency installation audit reported zero known npm vulnerabilities; this is not a full security or licensing audit.

Failed attempts: non-escalated Electron test hit a Playwright transport assertion inside the shell sandbox. The same test with desktop-process access passed. The first runtime launch needed the pinned Electron binary downloaded; setup:desktop is now explicit in development/CI. Initial packaging startup was slow; do not mistake missing console output for a successful build.

Packaged desktop: dist/win-unpacked/DeckPrep.exe passed the same workflow. Packaged load+render times: 99/178/301ms; search 16/33/51ms for 100/500/1000 tracks. Final portable executable --check-engines returned success=true and export=true. Authenticode status: NotSigned. SHA-256 for local DeckPrep-Portable-1.4.0-beta.9.exe: 404CE3F52979C4D3D0272C3139CA46EEEDBBEF21F05B1415BC10E03A8F2C8DA3. CI builds may have different hashes; use their associated checksum artifact.

Actual Rekordbox, 20 sessions/two weeks, independent computers, accessibility assistive technology, representative 200-case accuracy, signing and binary redistribution gates remain open.

Hosted Windows CI passed for implementation commit 4b3cdc0, including all source/packaged tests and portable export: https://github.com/byohros6/DeckPrep/actions/runs/36473829849 . A hosted test runner does not count as independent-user beta acceptance.

## Beta 10 design checkpoint (source build)

- 44/44 engine tests passed after the match guard; actual Electron desktop flow passed again, including an assertion that normal startup reaches maximized state. The latest 100/500/1000 synthetic row load+render was 86/178/294ms and search 18/36/49ms on the same development machine. These are single runs.
- Actual IPC check restored a crafted saved wrong-version candidate, confirmed its full title and reason were visible, verified the choice was disabled, and called the choice IPC directly to confirm the main process refused it. This catches a known manual-selection gap that earlier automatic-matching tests did not cover. Screenshot: `dist/qa-match-review-beta10.png` (ignored local evidence).
- Standalone concept opened in installed Chrome at 1440px and 600px. Verified visible full candidate title, disabled known wrong-version choice, required match decisions before preparing, Guided/Studio toggle, screenshot concept, optional playlist explanation, no narrow horizontal overflow, and zero page errors. Screenshots: `dist/qa-redesign-concept.png`, `dist/qa-redesign-narrow.png` (ignored local evidence). This is not production UI or an OCR test.
- First maximize assertion read before the window finished showing and failed; it now waits for the event result. First concept check exposed a Studio mode without screenshot entry; corrected before the final passing check.
- Folder-layout regression: a 30-second SoundCloud preview is now rejected in both flat and Sampler Bank layouts. `npm test` passed 45/45 after that change. This unit test exercises the pre-download guard; it does not prove every legitimate short SoundCloud song can be distinguished from a preview.
- Beta 10 label checkpoint: actual Electron E2E passed with **Prepare selected**, **Create playlist file**, and collapsed **Help and updates** visible in the expected states. Synthetic 100/500/1000-row load+render 85/202/311ms, search 18/36/49ms, single runs. `npm run test:scale` returned matching 6/12/19ms and save+restore 7/6/7ms, Node RSS 51–52MB. These numbers do not establish network search or audio throughput.
- Restore checkpoint: actual Electron IPC and UI on a generated 31-track saved session refused concurrent link import, local import and crate export while verifying outputs. Stop restored the dialog without discarding the session; retry completed. The existing local-audio/trim/M3U8 and wrong-version checks also passed. `npm test` remained 45/45. This did not simulate a process crash or disk failure.
- Graceful-close extension: with a second restore active, closing the native Electron window completed within six seconds and left the 31-track session file readable. This is not a forced-crash test. Latest desktop workflow still passed without renderer errors.
- Cache-maintenance extension: 47/47 unit tests passed. An actual Electron launch removed an eight-day-old generated orphan review folder before opening the window; a later launch retained the referenced review audio and completed preview/trim/M3U8. Generated-file tests also kept recent and unfamiliar cache contents. This is source-build evidence; hosted packaged verification for the change is pending.
- Hosted Windows CI passed for beta 10 implementation commit 6db86d6, including source/packaged desktop and portable generated-audio export: https://github.com/byohros6/DeckPrep/actions/runs/36510171638 . This precedes the cache-maintenance code; do not apply it to that later commit.
