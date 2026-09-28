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
