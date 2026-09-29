import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function validateSession(data) {
  if (!data || ![1, 2, undefined].includes(data.version) || !Array.isArray(data.tracks) || data.tracks.length > 10000) throw new Error('Invalid saved session');
  const ids = new Set();
  const tracks = data.tracks.map((track, index) => {
    if (!track || typeof track !== 'object' || typeof track.title !== 'string' || track.title.length > 10000) throw new Error('Invalid saved track');
    const id = typeof track.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(track.id) && !ids.has(track.id) ? track.id : randomUUID();
    ids.add(id);
    return { ...track, id, index: index + 1 };
  });
  return { ...data, tracks, version: 2 };
}

export function createSessionStore(file) {
  let pending = Promise.resolve();
  const enqueue = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  async function readFile(target) { return validateSession(JSON.parse(await fs.readFile(target, 'utf8'))); }
  return {
    async read() {
      await pending;
      try { return await readFile(file); }
      catch (primary) {
        try { return { ...await readFile(`${file}.bak`), recoveredFromBackup: true }; }
        catch (backup) {
          if (primary.code === 'ENOENT' && backup.code === 'ENOENT') return null;
          throw new Error('Saved session and recovery backup could not be read. Start fresh or export diagnostics.');
        }
      }
    },
    save(data) {
      const snapshot = JSON.stringify({ ...validateSession(structuredClone(data)), savedAt: new Date().toISOString() });
      if (Buffer.byteLength(snapshot) > 32 * 1024 * 1024) return Promise.reject(new Error('Saved session is too large'));
      return enqueue(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          const handle = await fs.open(temporary, 'wx');
          try { await handle.writeFile(snapshot, 'utf8'); await handle.sync(); } finally { await handle.close(); }
          let valid = false;
          try { await readFile(file); valid = true; } catch { /* Never replace the good backup with corrupt JSON. */ }
          if (valid) await fs.copyFile(file, `${file}.bak`);
          await fs.rename(temporary, file);
        } finally { await fs.rm(temporary, { force: true }); }
      });
    },
    clear: () => enqueue(async () => {
      await fs.rm(file, { force: true });
      await fs.rm(`${file}.bak`, { force: true });
    }),
    flush: () => pending
  };
}
