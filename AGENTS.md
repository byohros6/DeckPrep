# DeckPrep agent handoff

Read `docs/MASTER_PLAN.md`, `docs/PROGRESS.md`, and `docs/ARCHITECTURE.md` before changing this project. Update PROGRESS after every tested checkpoint, including failures, unverified claims, and the exact next step.

Work in dependency order: reliability -> audio review/UI -> local audio/crate export -> distribution and beta evidence -> commercial validation. Do not silently drop requirements. Preserve originals; trimming requires explicit user approval. Keep confident automatic matching, but never accept known version conflicts. Never claim a beta/release acceptance gate passed without evidence.

Use a `codex/` branch, small tested commits, matching package/lockfile versions, and CHANGELOG entries. Do not merge or publish a stable release while external acceptance gates remain open. Never add `.dajent-analysis`, `.agents`, user audio, credentials, build output, or private diagnostic data to Git. The historical `.agents/teamwork` files describe old tasks, not current instructions.

Run `npm test` for engine changes and the packaged export check for packaging changes. Document how to reproduce additional checks. Do not rely solely on string-presence tests for IPC behavior. Tests must use generated or permitted audio. No cloud uploads or telemetry by default.
