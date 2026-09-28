# Architecture and development

Electron main creates the window and registers a narrow preload bridge. The renderer is plain ES modules; engine modules handle import, candidate matching, acquisition, transcoding, tags and destination paths. FFmpeg and yt-dlp are child processes. No server/account/cloud is required.

Install with `npm ci`, provision pinned yt-dlp with `npm run setup:engine`, run `npm start`, test `npm test`, package `npm run dist:portable`. Windows is the supported release platform. CI checks packaged engine execution and generated audio export.

Durable state is moving to main-process ownership. Requested metadata and selected recording must remain distinct. Renderers must not supply executable paths or arbitrary preview paths. Audio decisions are explicit and durable. Engine modules should remain testable without Electron using dependency injection or thin Electron wrappers.

Version policy: keep package.json and package-lock.json aligned; beta increments for reviewable changes, stable only after MASTER_PLAN release gates. Record each checkpoint in CHANGELOG and PROGRESS. Do not merge/publish stable based solely on local tests.
