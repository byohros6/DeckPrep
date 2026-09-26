import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

function sessionPath() { return path.join(app.getPath('userData'), 'session.json'); }

export async function readSession() {
  try {
    const data = JSON.parse(await fs.readFile(sessionPath(), 'utf8'));
    if (data?.version !== 1 || !Array.isArray(data.tracks)) return null;
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error('Saved session could not be read');
  }
}

export async function saveSession(data) {
  if (!data || !Array.isArray(data.tracks) || data.tracks.length > 10000) throw new Error('Invalid session');
  const directory = path.dirname(sessionPath());
  await fs.mkdir(directory, { recursive: true });
  const file = sessionPath();
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ ...data, version: 1, savedAt: new Date().toISOString() }), 'utf8');
  await fs.rename(temporary, file);
}

export async function clearSession() {
  try { await fs.unlink(sessionPath()); } catch (err) { if (err.code !== 'ENOENT') throw err; }
}
