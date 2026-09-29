import fs from 'node:fs/promises';
import path from 'node:path';

// Delete only app-created audio-* children after verifying their real parent.
export async function releaseReviewAudio(file, cacheRoot) {
  if (!file) return;
  try {
    const root = await fs.realpath(cacheRoot);
    const actual = await fs.realpath(file);
    const directory = path.dirname(actual);
    if (path.dirname(directory).toLowerCase() !== root.toLowerCase() || !/^audio-[a-zA-Z0-9]+$/.test(path.basename(directory))) return;
    await fs.rm(directory, {recursive: true, force: true});
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// Run only at startup, before starting a queue. Keep every source referenced by
// the saved session, including a source whose review decision is already made.
export async function pruneReviewCache(cacheRoot, tracks = [], now = Date.now()) {
  const result = {removed: 0, kept: 0, errors: 0};
  let root;
  try { root = await fs.realpath(cacheRoot); }
  catch (error) { if (error.code === 'ENOENT') return result; throw error; }

  const referenced = new Set();
  for (const track of tracks) {
    if (!track?.reviewSourcePath) continue;
    try {
      const source = await fs.realpath(track.reviewSourcePath);
      const directory = path.dirname(source);
      if (path.dirname(directory).toLowerCase() === root.toLowerCase()
        && /^audio-[a-zA-Z0-9]+$/.test(path.basename(directory))) referenced.add(directory.toLowerCase());
    } catch (error) { if (error.code !== 'ENOENT') result.errors++; }
  }

  const minimumAgeMs = 7 * 24 * 60 * 60 * 1000;
  for (const entry of await fs.readdir(root, {withFileTypes: true})) {
    if (!entry.isDirectory() || !/^audio-[a-zA-Z0-9]+$/.test(entry.name)) continue;
    try {
      const directory = await fs.realpath(path.join(root, entry.name));
      if (path.dirname(directory).toLowerCase() !== root.toLowerCase()
        || referenced.has(directory.toLowerCase())) { result.kept++; continue; }
      const stat = await fs.stat(directory);
      if (now - stat.mtimeMs < minimumAgeMs) { result.kept++; continue; }
      const contents = await fs.readdir(directory, {withFileTypes: true});
      if (contents.some(item => !item.isFile() || !item.name.startsWith('source.'))) { result.kept++; continue; }
      await fs.rm(directory, {recursive: true});
      result.removed++;
    } catch (error) {
      if (error.code !== 'ENOENT') result.errors++;
    }
  }
  return result;
}
